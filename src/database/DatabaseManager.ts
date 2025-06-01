import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DatabaseManager {
  private db: Database.Database | null = null;
  private logger = new Logger();
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.DATABASE_PATH || './data/database.sqlite';
  }

  async init(): Promise<void> {
    try {
      // Ensure the directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Initialize the database
      this.db = new Database(this.dbPath);
      this.logger.info(`Database initialized at ${this.dbPath}`);

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Create tables
      await this.createTables();
      
      return Promise.resolve();
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      return Promise.reject(error);
    }
  }

  private async createTables(): Promise<void> {
    // Execute all SQL schema files
    const schemasDir = path.join(__dirname, 'schemas');
    
    // If running from compiled JS, adjust the path
    const actualSchemasDir = fs.existsSync(schemasDir) 
      ? schemasDir 
      : path.join(__dirname, '..', '..', 'src', 'database', 'schemas');

    if (!fs.existsSync(actualSchemasDir)) {
      fs.mkdirSync(actualSchemasDir, { recursive: true });
      this.logger.info(`Created schemas directory at ${actualSchemasDir}`);
      
      // Create initial schema files
      await this.createInitialSchemas(actualSchemasDir);
    } else {
      const schemaFiles = fs.readdirSync(actualSchemasDir)
        .filter(file => file.endsWith('.sql'));

      for (const file of schemaFiles) {
        const filePath = path.join(actualSchemasDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        try {
          this.db?.exec(sql);
          this.logger.debug(`Executed schema: ${file}`);
        } catch (error) {
          this.logger.error(`Error executing schema ${file}:`, error);
          throw error;
        }
      }
    }
  }

  private async createInitialSchemas(schemasDir: string): Promise<void> {
    // Create initial schema files
    const schemas = [
      {
        name: '01_guilds.sql',
        content: `
CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT DEFAULT '!',
  mod_log_channel TEXT,
  member_log_channel TEXT,
  message_log_channel TEXT,
  join_role TEXT,
  auto_role_enabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`
      },
      {
        name: '02_users.sql',
        content: `
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  is_blacklisted INTEGER DEFAULT 0,
  blacklist_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`
      },
      {
        name: '03_guild_configs.sql',
        content: `
CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id TEXT PRIMARY KEY,
  anti_raid_enabled INTEGER DEFAULT 0,
  anti_raid_join_threshold INTEGER DEFAULT 10,
  anti_raid_join_time_window INTEGER DEFAULT 10000,
  anti_raid_action TEXT DEFAULT 'kick',
  anti_spam_enabled INTEGER DEFAULT 0,
  anti_spam_message_threshold INTEGER DEFAULT 5,
  anti_spam_time_window INTEGER DEFAULT 3000,
  anti_spam_action TEXT DEFAULT 'mute',
  anti_mention_enabled INTEGER DEFAULT 0,
  anti_mention_threshold INTEGER DEFAULT 5,
  anti_mention_action TEXT DEFAULT 'mute',
  anti_link_enabled INTEGER DEFAULT 0,
  anti_link_whitelist TEXT,
  anti_link_action TEXT DEFAULT 'delete',
  anti_invite_enabled INTEGER DEFAULT 0,
  anti_invite_action TEXT DEFAULT 'delete',
  anti_caps_enabled INTEGER DEFAULT 0,
  anti_caps_threshold INTEGER DEFAULT 70,
  anti_caps_min_length INTEGER DEFAULT 10,
  anti_caps_action TEXT DEFAULT 'delete',
  alt_detection_enabled INTEGER DEFAULT 0,
  alt_min_age INTEGER DEFAULT 604800000,
  alt_action TEXT DEFAULT 'kick',
  automod_log_channel TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);`
      },
      {
        name: '04_mod_actions.sql',
        content: `
CREATE TABLE IF NOT EXISTS mod_actions (
  action_id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  reason TEXT,
  duration INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mod_actions_user
ON mod_actions(user_id, guild_id);`
      },
      {
        name: '05_role_permissions.sql',
        content: `
CREATE TABLE IF NOT EXISTS role_permissions (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  command TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, role_id, command),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);`
      },
      {
        name: '06_auto_responses.sql',
        content: `
CREATE TABLE IF NOT EXISTS auto_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  response TEXT NOT NULL,
  is_regex INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);`
      },
      {
        name: '07_raid_logs.sql',
        content: `
CREATE TABLE IF NOT EXISTS raid_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  join_count INTEGER NOT NULL,
  action_taken TEXT,
  is_resolved INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);`
      },
      {
        name: '08_custom_commands.sql',
        content: `
CREATE TABLE IF NOT EXISTS custom_commands (
  guild_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  response TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, command_name),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);`
      }
    ];

    for (const schema of schemas) {
      const filePath = path.join(schemasDir, schema.name);
      fs.writeFileSync(filePath, schema.content);
      this.logger.debug(`Created schema file: ${schema.name}`);
      
      // Execute the schema
      try {
        this.db?.exec(schema.content);
        this.logger.debug(`Executed schema: ${schema.name}`);
      } catch (error) {
        this.logger.error(`Error executing schema ${schema.name}:`, error);
        throw error;
      }
    }
  }

  /**
   * Execute a query and return all results
   */
  query(sql: string, params: any = {}): any[] {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(params);
    } catch (error) {
      this.logger.error(`Database query error: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Execute a query and return the first result
   */
  get(sql: string, params: any = {}): any {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(params);
    } catch (error) {
      this.logger.error(`Database get error: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Execute a query and return the number of affected rows
   */
  run(sql: string, params: any = {}): number {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(params);
      return result.changes;
    } catch (error) {
      this.logger.error(`Database run error: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Begin a transaction
   */
  transaction(cb: (db: DatabaseManager) => void): void {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const transaction = this.db.transaction((db: any) => {
        cb(this);
      });
      
      transaction();
    } catch (error) {
      this.logger.error('Transaction error:', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.logger.info('Database connection closed');
    }
    return Promise.resolve();
  }
}