import { SlashCommandBuilder, CommandInteraction, GuildMember } from 'discord.js';
import { errorEmbed, successEmbed, logEmbed } from '../../utils/commandUtils.js';
import { canUseCommand, canTargetMember } from '../../utils/permissionUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user for breaking rules')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to warn')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)),
  
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
    const hasPermission = await canUseCommand(client, member, 'warn');
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [errorEmbed('You do not have permission to use this command')],
        ephemeral: true 
      });
    }
    
    // Get command options
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    
    if (!user) {
      return interaction.reply({
        embeds: [errorEmbed('User not found')],
        ephemeral: true
      });
    }
    
    if (!reason) {
      return interaction.reply({
        embeds: [errorEmbed('Reason is required')],
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
        embeds: [errorEmbed('You cannot warn this user. They may have a higher role than you or be the server owner.')],
        ephemeral: true
      });
    }
    
    try {
      // Record the warning in the database
      const now = Date.now();
      client.db.run(
        `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        {
          guild_id: interaction.guild.id,
          user_id: user.id,
          moderator_id: interaction.user.id,
          action_type: 'warn',
          reason: reason,
          created_at: now
        }
      );
      
      // Get warning count for this user
      const warningCount = client.db.get(
        `SELECT COUNT(*) as count FROM mod_actions 
         WHERE guild_id = ? AND user_id = ? AND action_type = 'warn'`,
        { guild_id: interaction.guild.id, user_id: user.id }
      );
      
      // Send success message
      await interaction.reply({
        embeds: [
          successEmbed(
            `Successfully warned ${user.tag} (${user.id})`, 
            { 
              title: 'User Warned',
              timestamp: true
            }
          )
        ]
      });
      
      // Try to DM the user about the warning
      try {
        await user.send({
          embeds: [
            warningEmbed(
              `You have been warned in **${interaction.guild.name}**\n\n**Reason:** ${reason}`,
              {
                title: 'Warning Received',
                timestamp: true
              }
            )
          ]
        });
      } catch (error) {
        // Failed to DM user, ignore
        client.logger.debug(`Failed to DM warning to user ${user.id}:`, error);
      }
      
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
              logEmbed('User Warned', {
                user: interaction.user,
                target: user,
                reason: reason,
                color: 0xf1c40f, // Yellow
                fields: [
                  { 
                    name: 'Warning Count', 
                    value: `${warningCount?.count || 1}`,
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
      client.logger.error('Error executing warn command:', error);
      
      return interaction.reply({
        embeds: [errorEmbed(`Failed to warn user: ${(error as Error).message}`)],
        ephemeral: true
      });
    }
  },
};

// Helper function for warning embed
function warningEmbed(description: string, options: {
  title?: string;
  footer?: string;
  timestamp?: boolean;
} = {}): any {
  return {
    title: options.title || 'Warning',
    description,
    color: 0xf39c12, // Yellow/Orange
    footer: options.footer ? { text: options.footer } : undefined,
    timestamp: options.timestamp ? new Date() : undefined,
  };
}