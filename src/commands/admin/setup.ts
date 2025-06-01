import { SlashCommandBuilder, CommandInteraction, GuildMember, ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/commandUtils.js';
import { canUseCommand } from '../../utils/permissionUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up the bot for your server')
    .addSubcommand(subcommand =>
      subcommand
        .setName('modlog')
        .setDescription('Set up the moderation log channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to use for moderation logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('memberlog')
        .setDescription('Set up the member log channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to use for member logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('messagelog')
        .setDescription('Set up the message log channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to use for message logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('joinrole')
        .setDescription('Set the role to give to new members')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to give to new members')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View the current setup status')),
  
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
    const hasPermission = await canUseCommand(client, member, 'setup');
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [errorEmbed('You do not have permission to use this command')],
        ephemeral: true 
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    const now = Date.now();
    
    // Check if guild exists in database, if not create it
    const guildExists = client.db.get(
      'SELECT guild_id FROM guilds WHERE guild_id = ?',
      { guild_id: interaction.guild.id }
    );
    
    if (!guildExists) {
      client.db.run(
        'INSERT INTO guilds (guild_id, created_at, updated_at) VALUES (?, ?, ?)',
        { guild_id: interaction.guild.id, created_at: now, updated_at: now }
      );
      
      // Also initialize guild configs
      client.db.run(
        'INSERT INTO guild_configs (guild_id, created_at, updated_at) VALUES (?, ?, ?)',
        { guild_id: interaction.guild.id, created_at: now, updated_at: now }
      );
    }
    
    // Handle subcommands
    switch (subcommand) {
      case 'modlog':
        return handleModLog(interaction, client);
      case 'memberlog':
        return handleMemberLog(interaction, client);
      case 'messagelog':
        return handleMessageLog(interaction, client);
      case 'joinrole':
        return handleJoinRole(interaction, client);
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

// Handle moderation log setup
async function handleModLog(interaction: CommandInteraction, client: any) {
  const channel = interaction.options.getChannel('channel');
  
  if (!channel) {
    return interaction.reply({
      embeds: [errorEmbed('Channel not found')],
      ephemeral: true
    });
  }
  
  // Update the database
  client.db.run(
    'UPDATE guilds SET mod_log_channel = ?, updated_at = ? WHERE guild_id = ?',
    { 
      mod_log_channel: channel.id, 
      updated_at: Date.now(), 
      guild_id: interaction.guild!.id 
    }
  );
  
  // Send a test message to the channel
  try {
    const textChannel = await interaction.guild!.channels.fetch(channel.id);
    if (textChannel?.isTextBased()) {
      const testEmbed = new EmbedBuilder()
        .setTitle('Moderation Log Setup')
        .setDescription('This channel has been set up to receive moderation logs.')
        .setColor(0x3498db)
        .setTimestamp();
      
      await textChannel.send({ embeds: [testEmbed] });
    }
  } catch (error) {
    client.logger.error('Error sending test message to mod log channel:', error);
  }
  
  return interaction.reply({
    embeds: [successEmbed(`Moderation logs will now be sent to <#${channel.id}>`)],
    ephemeral: true
  });
}

// Handle member log setup
async function handleMemberLog(interaction: CommandInteraction, client: any) {
  const channel = interaction.options.getChannel('channel');
  
  if (!channel) {
    return interaction.reply({
      embeds: [errorEmbed('Channel not found')],
      ephemeral: true
    });
  }
  
  // Update the database
  client.db.run(
    'UPDATE guilds SET member_log_channel = ?, updated_at = ? WHERE guild_id = ?',
    { 
      member_log_channel: channel.id, 
      updated_at: Date.now(), 
      guild_id: interaction.guild!.id 
    }
  );
  
  // Send a test message to the channel
  try {
    const textChannel = await interaction.guild!.channels.fetch(channel.id);
    if (textChannel?.isTextBased()) {
      const testEmbed = new EmbedBuilder()
        .setTitle('Member Log Setup')
        .setDescription('This channel has been set up to receive member join/leave logs.')
        .setColor(0x2ecc71)
        .setTimestamp();
      
      await textChannel.send({ embeds: [testEmbed] });
    }
  } catch (error) {
    client.logger.error('Error sending test message to member log channel:', error);
  }
  
  return interaction.reply({
    embeds: [successEmbed(`Member logs will now be sent to <#${channel.id}>`)],
    ephemeral: true
  });
}

// Handle message log setup
async function handleMessageLog(interaction: CommandInteraction, client: any) {
  const channel = interaction.options.getChannel('channel');
  
  if (!channel) {
    return interaction.reply({
      embeds: [errorEmbed('Channel not found')],
      ephemeral: true
    });
  }
  
  // Update the database
  client.db.run(
    'UPDATE guilds SET message_log_channel = ?, updated_at = ? WHERE guild_id = ?',
    { 
      message_log_channel: channel.id, 
      updated_at: Date.now(), 
      guild_id: interaction.guild!.id 
    }
  );
  
  // Send a test message to the channel
  try {
    const textChannel = await interaction.guild!.channels.fetch(channel.id);
    if (textChannel?.isTextBased()) {
      const testEmbed = new EmbedBuilder()
        .setTitle('Message Log Setup')
        .setDescription('This channel has been set up to receive message logs.')
        .setColor(0x3498db)
        .setTimestamp();
      
      await textChannel.send({ embeds: [testEmbed] });
    }
  } catch (error) {
    client.logger.error('Error sending test message to message log channel:', error);
  }
  
  return interaction.reply({
    embeds: [successEmbed(`Message logs will now be sent to <#${channel.id}>`)],
    ephemeral: true
  });
}

// Handle join role setup
async function handleJoinRole(interaction: CommandInteraction, client: any) {
  const role = interaction.options.getRole('role');
  
  if (!role) {
    return interaction.reply({
      embeds: [errorEmbed('Role not found')],
      ephemeral: true
    });
  }
  
  // Check if the bot can assign this role
  const botMember = interaction.guild!.members.me;
  if (!botMember) {
    return interaction.reply({
      embeds: [errorEmbed('Could not find bot member in the server')],
      ephemeral: true
    });
  }
  
  if (role.position >= botMember.roles.highest.position) {
    return interaction.reply({
      embeds: [errorEmbed('I cannot assign this role as it is higher than or equal to my highest role')],
      ephemeral: true
    });
  }
  
  // Update the database
  client.db.run(
    'UPDATE guilds SET join_role = ?, auto_role_enabled = 1, updated_at = ? WHERE guild_id = ?',
    { 
      join_role: role.id, 
      updated_at: Date.now(), 
      guild_id: interaction.guild!.id 
    }
  );
  
  return interaction.reply({
    embeds: [successEmbed(`New members will now receive the <@&${role.id}> role`)],
    ephemeral: true
  });
}

// Handle status check
async function handleStatus(interaction: CommandInteraction, client: any) {
  const guildConfig = client.db.get(
    'SELECT mod_log_channel, member_log_channel, message_log_channel, join_role, auto_role_enabled FROM guilds WHERE guild_id = ?',
    { guild_id: interaction.guild!.id }
  );
  
  if (!guildConfig) {
    return interaction.reply({
      embeds: [errorEmbed('Guild configuration not found')],
      ephemeral: true
    });
  }
  
  // Create status embed
  const statusEmbed = new EmbedBuilder()
    .setTitle('Bot Setup Status')
    .setColor(0x3498db)
    .setTimestamp()
    .addFields(
      { 
        name: 'Moderation Log', 
        value: guildConfig.mod_log_channel 
          ? `<#${guildConfig.mod_log_channel}>` 
          : 'Not configured',
        inline: true
      },
      { 
        name: 'Member Log', 
        value: guildConfig.member_log_channel 
          ? `<#${guildConfig.member_log_channel}>` 
          : 'Not configured',
        inline: true
      },
      { 
        name: 'Message Log', 
        value: guildConfig.message_log_channel 
          ? `<#${guildConfig.message_log_channel}>` 
          : 'Not configured',
        inline: true
      },
      { 
        name: 'Join Role', 
        value: guildConfig.join_role 
          ? `<@&${guildConfig.join_role}> (${guildConfig.auto_role_enabled ? 'Enabled' : 'Disabled'})` 
          : 'Not configured',
        inline: true
      }
    );
  
  // Get anti-raid configuration
  const antiRaidConfig = client.db.get(
    `SELECT anti_raid_enabled, anti_spam_enabled, anti_mention_enabled, 
            anti_link_enabled, anti_invite_enabled, alt_detection_enabled
     FROM guild_configs WHERE guild_id = ?`,
    { guild_id: interaction.guild!.id }
  );
  
  if (antiRaidConfig) {
    statusEmbed.addFields(
      { 
        name: 'Security Features', 
        value: [
          `Anti-Raid: ${antiRaidConfig.anti_raid_enabled ? '✅' : '❌'}`,
          `Anti-Spam: ${antiRaidConfig.anti_spam_enabled ? '✅' : '❌'}`,
          `Anti-Mention: ${antiRaidConfig.anti_mention_enabled ? '✅' : '❌'}`,
          `Anti-Link: ${antiRaidConfig.anti_link_enabled ? '✅' : '❌'}`,
          `Anti-Invite: ${antiRaidConfig.anti_invite_enabled ? '✅' : '❌'}`,
          `Alt Detection: ${antiRaidConfig.alt_detection_enabled ? '✅' : '❌'}`
        ].join('\n'),
        inline: false
      }
    );
  }
  
  return interaction.reply({
    embeds: [statusEmbed],
    ephemeral: true
  });
}