import { config } from 'dotenv';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { loadCommands } from './utils/commandLoader.js';
import { loadEvents } from './utils/eventLoader.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { Logger } from './utils/Logger.js';

// Load environment variables
config();

// Initialize logger
const logger = new Logger();

// Check for required environment variables
if (!process.env.DISCORD_TOKEN) {
  logger.error('Missing DISCORD_TOKEN in environment variables');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  logger.error('Missing CLIENT_ID in environment variables');
  process.exit(1);
}

// Initialize the client with intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildScheduledEvents,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
    Partials.ThreadMember,
  ],
});

// Add commands and cooldowns collections to client
client.commands = new Collection();
client.cooldowns = new Collection();

// Initialize database
client.db = new DatabaseManager();

// Attach logger to client
client.logger = logger;

// Load commands and events
(async () => {
  try {
    // Initialize database before loading commands and events
    await client.db.init();
    
    // Load commands and events
    await loadCommands(client);
    await loadEvents(client);
    
    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);
    
    logger.info(`Bot is online as ${client.user?.tag}`);
  } catch (error) {
    logger.error('Failed to initialize the bot:', error);
    process.exit(1);
  }
})();

// Handle process termination
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

async function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  // Close the database connection
  await client.db.close();
  
  // Destroy the client connection
  client.destroy();
  
  // Exit the process
  process.exit(0);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Type augmentation for Discord.js Client
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, any>;
    cooldowns: Collection<string, Collection<string, number>>;
    db: DatabaseManager;
    logger: Logger;
  }
}