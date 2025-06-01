import { SlashCommandBuilder, CommandInteraction, GuildMember, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, logEmbed } from '../../utils/commandUtils.js';
import { canUseCommand, canTargetMember } from '../../utils/permissionUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false))
    .addBooleanOption(option => 
      option.setName('delete_messages')
        .setDescription('Delete recent messages from the user')
        .setRequired(false))
    .addIntegerOption(option => 
      option.setName('days')
        .setDescription('Number of days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
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
    const hasPermission = await canUseCommand(client, member, 'ban');
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [errorEmbed('You do not have permission to use this command')],
        ephemeral: true 
      });
    }
    
    // Get command options
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteMessages = interaction.options.getBoolean('delete_messages') ?? true;
    const days = interaction.options.getInteger('days') ?? (deleteMessages ? 1 : 0);
    
    if (!user) {
      return interaction.reply({
        embeds: [errorEmbed('User not found')],
        ephemeral: true
      });
    }
    
    // Check if the target is in the guild
    let targetMember: GuildMember | null = null;
    try {
      targetMember = await interaction.guild.members.fetch(user.id);
    } catch (error) {
      // User is not in the guild, we can still ban them
    }
    
    // If the target is in the guild, check if they can be targeted
    if (targetMember) {
      if (!canTargetMember(member, targetMember)) {
        return interaction.reply({
          embeds: [errorEmbed('You cannot ban this user. They may have a higher role than you or be the server owner.')],
          ephemeral: true
        });
      }
    }
    
    try {
      // Ban the user
      await interaction.guild.members.ban(user, { 
        deleteMessageDays: days,
        reason: `${reason} (Banned by ${interaction.user.tag})`
      });
      
      // Record the action in the database
      const now = Date.now();
      client.db.run(
        `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        {
          guild_id: interaction.guild.id,
          user_id: user.id,
          moderator_id: interaction.user.id,
          action_type: 'ban',
          reason: reason,
          created_at: now
        }
      );
      
      // Send success message
      await interaction.reply({
        embeds: [
          successEmbed(
            `Successfully banned ${user.tag} (${user.id})`, 
            { 
              title: 'User Banned',
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
              logEmbed('User Banned', {
                user: interaction.user,
                target: user,
                reason: reason,
                color: 0xed4245, // Red
                fields: [
                  { 
                    name: 'Message Deletion', 
                    value: deleteMessages ? `Last ${days} day(s)` : 'None',
                    inline: true
                  }
                ],
                timestamp: true
              })
            ]
          });
        }
      }
    } catch (error) {
      client.logger.error('Error executing ban command:', error);
      
      return interaction.reply({
        embeds: [errorEmbed(`Failed to ban user: ${(error as Error).message}`)],
        ephemeral: true
      });
    }
  },
};