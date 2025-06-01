import { SlashCommandBuilder, CommandInteraction, GuildMember, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, logEmbed, parseDuration, formatDuration } from '../../utils/commandUtils.js';
import { canUseCommand, canTargetMember } from '../../utils/permissionUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user for a specified duration')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to timeout')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('duration')
        .setDescription('Duration of the timeout (e.g., 1h, 1d, 7d)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('reason')
        .setDescription('Reason for the timeout')
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
    const hasPermission = await canUseCommand(client, member, 'timeout');
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [errorEmbed('You do not have permission to use this command')],
        ephemeral: true 
      });
    }
    
    // Get command options
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!user) {
      return interaction.reply({
        embeds: [errorEmbed('User not found')],
        ephemeral: true
      });
    }
    
    if (!durationStr) {
      return interaction.reply({
        embeds: [errorEmbed('Duration is required')],
        ephemeral: true
      });
    }
    
    // Parse the duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid duration format. Examples: 1m, 1h, 1d')],
        ephemeral: true
      });
    }
    
    // Discord timeout limit is 28 days
    const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000; // 28 days in milliseconds
    if (durationMs > maxTimeoutMs) {
      return interaction.reply({
        embeds: [errorEmbed('Timeout duration cannot exceed 28 days')],
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
        embeds: [errorEmbed('You cannot timeout this user. They may have a higher role than you or be the server owner.')],
        ephemeral: true
      });
    }
    
    try {
      // Apply the timeout
      await targetMember.timeout(
        durationMs, 
        `${reason} (Timed out by ${interaction.user.tag})`
      );
      
      // Calculate expiration time
      const now = Date.now();
      const expiresAt = now + durationMs;
      
      // Record the action in the database
      client.db.run(
        `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, duration, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        {
          guild_id: interaction.guild.id,
          user_id: user.id,
          moderator_id: interaction.user.id,
          action_type: 'timeout',
          reason: reason,
          duration: durationMs,
          expires_at: expiresAt,
          created_at: now
        }
      );
      
      // Format the duration for display
      const formattedDuration = formatDuration(durationMs);
      
      // Send success message
      await interaction.reply({
        embeds: [
          successEmbed(
            `Successfully timed out ${user.tag} (${user.id}) for ${formattedDuration}`, 
            { 
              title: 'User Timed Out',
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
              logEmbed('User Timed Out', {
                user: interaction.user,
                target: user,
                reason: reason,
                duration: formattedDuration,
                color: 0xe67e22, // Orange
                fields: [
                  { 
                    name: 'Expires At', 
                    value: `<t:${Math.floor(expiresAt / 1000)}:F>`,
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
      client.logger.error('Error executing timeout command:', error);
      
      return interaction.reply({
        embeds: [errorEmbed(`Failed to timeout user: ${(error as Error).message}`)],
        ephemeral: true
      });
    }
  },
};