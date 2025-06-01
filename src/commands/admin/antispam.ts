import { SlashCommandBuilder, CommandInteraction, GuildMember, EmbedBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/commandUtils.js';
import { canUseCommand } from '../../utils/permissionUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('Configure anti-spam settings')
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable anti-spam protection'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable anti-spam protection'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('config')
        .setDescription('Configure anti-spam settings')
        .addIntegerOption(option =>
          option.setName('message_threshold')
            .setDescription('Number of messages to trigger anti-spam')
            .setMinValue(3)
            .setMaxValue(15)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('time_window')
            .setDescription('Time window in seconds')
            .setMinValue(1)
            .setMaxValue(30)
            .setRequired(false))
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to take when spam is detected')
            .setRequired(false)
            .addChoices(
              { name: 'Delete messages', value: 'delete' },
              { name: 'Warn user', value: 'warn' },
              { name: 'Mute user', value: 'mute' },
              { name: 'Kick user', value: 'kick' },
              { name: 'Ban user', value: 'ban' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View current anti-spam settings')),
  
  category: 'admin',
  
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
    const hasPermission = await canUseCommand(client, member, 'antispam');
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [errorEmbed('You do not have permission to use this command')],
        ephemeral: true 
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    const now = Date.now();
    
    // Make sure guild config exists
    const guildConfigExists = client.db.get(
      'SELECT guild_id FROM guild_configs WHERE guild_id = ?',
      { guild_id: interaction.guild.id }
    );
    
    if (!guildConfigExists) {
      // Create guild config
      client.db.run(
        'INSERT INTO guild_configs (guild_id, created_at, updated_at) VALUES (?, ?, ?)',
        { guild_id: interaction.guild.id, created_at: now, updated_at: now }
      );
    }
    
    // Handle subcommands
    switch (subcommand) {
      case 'enable':
        return handleEnable(interaction, client);
      case 'disable':
        return handleDisable(interaction, client);
      case 'config':
        return handleConfig(interaction, client);
      case 'status':
        return handleStatus(interaction, client);
      default:
        return interaction.reply({
          embeds: [errorEmbed('Unknown subcommand')],
          ephemeral: true
        });
    }
  },
};

// Handle enabling anti-spam
async function handleEnable(interaction: CommandInteraction, client: any) {
  // Update the database
  client.db.run(
    'UPDATE guild_configs SET anti_spam_enabled = 1, updated_at = ? WHERE guild_id = ?',
    { updated_at: Date.now(), guild_id: interaction.guild!.id }
  );
  
  return interaction.reply({
    embeds: [successEmbed('Anti-spam protection has been enabled')],
    ephemeral: false
  });
}

// Handle disabling anti-spam
async function handleDisable(interaction: CommandInteraction, client: any) {
  // Update the database
  client.db.run(
    'UPDATE guild_configs SET anti_spam_enabled = 0, updated_at = ? WHERE guild_id = ?',
    { updated_at: Date.now(), guild_id: interaction.guild!.id }
  );
  
  return interaction.reply({
    embeds: [successEmbed('Anti-spam protection has been disabled')],
    ephemeral: false
  });
}

// Handle configuring anti-spam settings
async function handleConfig(interaction: CommandInteraction, client: any) {
  const messageThreshold = interaction.options.getInteger('message_threshold');
  const timeWindow = interaction.options.getInteger('time_window');
  const action = interaction.options.getString('action');
  
  // Get current settings to include in response
  const currentSettings = client.db.get(
    'SELECT * FROM guild_configs WHERE guild_id = ?',
    { guild_id: interaction.guild!.id }
  );
  
  // Build the SQL query based on provided options
  let sql = 'UPDATE guild_configs SET updated_at = ?';
  const params: Record<string, any> = { updated_at: Date.now() };
  
  if (messageThreshold !== null) {
    sql += ', anti_spam_message_threshold = ?';
    params.message_threshold = messageThreshold;
  }
  
  if (timeWindow !== null) {
    sql += ', anti_spam_time_window = ?';
    // Convert seconds to milliseconds
    params.time_window = timeWindow * 1000;
  }
  
  if (action !== null) {
    sql += ', anti_spam_action = ?';
    params.action = action;
  }
  
  sql += ' WHERE guild_id = ?';
  params.guild_id = interaction.guild!.id;
  
  // Update the database
  client.db.run(sql, params);
  
  // Build response message
  let responseText = 'Anti-spam settings updated:';
  
  if (messageThreshold !== null) {
    responseText += `\n• Message threshold: ${messageThreshold} messages`;
  }
  
  if (timeWindow !== null) {
    responseText += `\n• Time window: ${timeWindow} seconds`;
  }
  
  if (action !== null) {
    responseText += `\n• Action: ${action}`;
  }
  
  return interaction.reply({
    embeds: [successEmbed(responseText)],
    ephemeral: false
  });
}

// Handle status check
async function handleStatus(interaction: CommandInteraction, client: any) {
  const settings = client.db.get(
    `SELECT anti_spam_enabled, anti_spam_message_threshold, 
            anti_spam_time_window, anti_spam_action
     FROM guild_configs WHERE guild_id = ?`,
    { guild_id: interaction.guild!.id }
  );
  
  if (!settings) {
    return interaction.reply({
      embeds: [errorEmbed('Anti-spam settings not found')],
      ephemeral: true
    });
  }
  
  // Create status embed
  const statusEmbed = new EmbedBuilder()
    .setTitle('Anti-Spam Settings')
    .setColor(settings.anti_spam_enabled ? 0x2ecc71 : 0xe74c3c)
    .setDescription(`Anti-spam protection is currently **${settings.anti_spam_enabled ? 'ENABLED' : 'DISABLED'}**`)
    .addFields(
      { 
        name: 'Message Threshold', 
        value: `${settings.anti_spam_message_threshold} messages`,
        inline: true
      },
      { 
        name: 'Time Window', 
        value: `${settings.anti_spam_time_window / 1000} seconds`,
        inline: true
      },
      { 
        name: 'Action', 
        value: settings.anti_spam_action || 'None',
        inline: true
      }
    )
    .setTimestamp();
  
  return interaction.reply({
    embeds: [statusEmbed],
    ephemeral: false
  });
}