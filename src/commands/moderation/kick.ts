import { SlashCommandBuilder, CommandInteraction, GuildMember, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, logEmbed } from '../../utils/commandUtils.js';
import { canUseCommand, canTargetMember } from '../../utils/permissionUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false)),
  
  category: 'moderation',
  
  async execute(interaction: CommandInteraction) {
    // Ensure this is used in a guild
    if (!interaction.guild || !interaction.member) {
      return interaction.reply({ 
        embeds: [errorEmbed('This command can only be used in a server')],
        ephemeral: true 
      });
    }
    
    const client = interaction.client;
    const member = interaction.member as GuildMember;
    
    // Check if user has permission to use this command
    const hasPermission = await canUseCommand(client, member, 'kick');
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [errorEmbed('You do not have permission to use this command')],
        ephemeral: true 
      });
    }
    
    // Get command options
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!user) {
      return interaction.reply({
        embeds: [errorEmbed('User not found')],
        ephemeral: true
      });
    }
    
    // Get the target member
    let targetMember: GuildMember;
    try {
      targetMember = await interaction.guild.members.fetch(user.id);
    } catch (error) {
      return interaction.reply({
        embeds: [errorEmbed('User is not in this server')],
        ephemeral: true
      });
    }
    
    // Check if the user can be targeted
    if (!canTargetMember(member, targetMember)) {
      return interaction.reply({
        embeds: [errorEmbed('You cannot kick this user. They may have a higher role than you or be the server owner.')],
        ephemeral: true
      });
    }
    
    try {
      // Kick the user
      await targetMember.kick(`${reason} (Kicked by ${interaction.user.tag})`);
      
      // Record the action in the database
      const now = Date.now();
      client.db.run(
        `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        {
          guild_id: interaction.guild.id,
          user_id: user.id,
          moderator_id: interaction.user.id,
          action_type: 'kick',
          reason: reason,
          created_at: now
        }
      );
      
      // Send success message
      await interaction.reply({
        embeds: [
          successEmbed(
            `Successfully kicked ${user.tag} (${user.id})`, 
            { 
              title: 'User Kicked',
              timestamp: true
            }
          )
        ]
      });
      
      // Log the action if a mod log channel is set
      const guildConfig = client.db.get(
        'SELECT mod_log_channel FROM guilds WHERE guild_id = ?',
        { guild_id: interaction.guild.id }
      );
      
      if (guildConfig?.mod_log_channel) {
        const logChannel = await interaction.guild.channels.fetch(guildConfig.mod_log_channel)
          .catch(() => null);
        
        if (logChannel?.isTextBased()) {
          logChannel.send({
            embeds: [
              logEmbed('User Kicked', {
                user: interaction.user,
                target: user,
                reason: reason,
                color: 0xf1c40f, // Yellow
                timestamp: true
              })
            ]
          });
        }
      }
    } catch (error) {
      client.logger.error('Error executing kick command:', error);
      
      return interaction.reply({
        embeds: [errorEmbed(`Failed to kick user: ${(error as Error).message}`)],
        ephemeral: true
      });
    }
  },
};