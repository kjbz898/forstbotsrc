import { SlashCommandBuilder, CommandInteraction, GuildMember, EmbedBuilder } from 'discord.js';
import { errorEmbed, infoEmbed } from '../../utils/commandUtils.js';
import { canUseCommand } from '../../utils/permissionUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View moderation history for a user')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to check')
        .setRequired(true))
    .addBooleanOption(option => 
      option.setName('detailed')
        .setDescription('Show detailed history')
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
    const hasPermission = await canUseCommand(client, member, 'history');
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [errorEmbed('You do not have permission to use this command')],
        ephemeral: true 
      });
    }
    
    // Get command options
    const user = interaction.options.getUser('user');
    const detailed = interaction.options.getBoolean('detailed') ?? false;
    
    if (!user) {
      return interaction.reply({
        embeds: [errorEmbed('User not found')],
        ephemeral: true
      });
    }
    
    try {
      // Get user's moderation history from the database
      const actions = client.db.query(
        `SELECT action_id, action_type, reason, moderator_id, created_at
         FROM mod_actions
         WHERE guild_id = ? AND user_id = ?
         ORDER BY created_at DESC`,
        { guild_id: interaction.guild.id, user_id: user.id }
      );
      
      if (!actions || actions.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed(`${user.tag} has no moderation history in this server`)],
          ephemeral: true
        });
      }
      
      // Count actions by type
      const counts: Record<string, number> = {};
      for (const action of actions) {
        counts[action.action_type] = (counts[action.action_type] || 0) + 1;
      }
      
      // Create summary
      let summary = Object.entries(counts)
        .map(([type, count]) => `**${type}**: ${count}`)
        .join('\n');
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`Moderation History for ${user.tag}`)
        .setColor(0x3498db)
        .setThumbnail(user.displayAvatarURL())
        .addFields({ name: 'Summary', value: summary })
        .setFooter({ text: `User ID: ${user.id}` })
        .setTimestamp();
      
      // Add detailed history if requested
      if (detailed && actions.length > 0) {
        // Get the latest 10 actions for detailed view
        const latestActions = actions.slice(0, 10);
        
        let detailedHistory = '';
        for (const action of latestActions) {
          const timestamp = Math.floor(action.created_at / 1000);
          
          let moderator;
          try {
            moderator = await interaction.client.users.fetch(action.moderator_id);
          } catch {
            moderator = { tag: 'Unknown Moderator' };
          }
          
          detailedHistory += `**${action.action_type}** - <t:${timestamp}:R>\n`;
          detailedHistory += `By: ${moderator.tag}\n`;
          detailedHistory += `Reason: ${action.reason || 'No reason provided'}\n\n`;
        }
        
        embed.addFields({ name: 'Recent Actions', value: detailedHistory || 'None' });
        
        if (actions.length > 10) {
          embed.setFooter({ 
            text: `User ID: ${user.id} | Showing 10/${actions.length} actions` 
          });
        }
      }
      
      // Send the response
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    } catch (error) {
      client.logger.error('Error executing history command:', error);
      
      return interaction.reply({
        embeds: [errorEmbed(`Failed to fetch user history: ${(error as Error).message}`)],
        ephemeral: true
      });
    }
  },
};