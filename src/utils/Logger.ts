import chalk from 'chalk';
import dayjs from 'dayjs';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export class Logger {
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  private getTimestamp(): string {
    return dayjs().format('YYYY-MM-DD HH:mm:ss');
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };

    return levels[level] <= levels[this.logLevel];
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(
        `${chalk.gray(this.getTimestamp())} ${chalk.red.bold('ERROR')} ${message}`,
        ...args
      );
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(
        `${chalk.gray(this.getTimestamp())} ${chalk.yellow.bold('WARN')} ${message}`,
        ...args
      );
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(
        `${chalk.gray(this.getTimestamp())} ${chalk.blue.bold('INFO')} ${message}`,
        ...args
      );
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(
        `${chalk.gray(this.getTimestamp())} ${chalk.magenta.bold('DEBUG')} ${message}`,
        ...args
      );
    }
  }

  command(userId: string, guildId: string | null, commandName: string): void {
    if (this.shouldLog('info')) {
      console.info(
        `${chalk.gray(this.getTimestamp())} ${chalk.green.bold('COMMAND')} ${chalk.cyan(
          commandName
        )} by ${userId} in ${guildId || 'DM'}`
      );
    }
  }

  system(message: string): void {
    if (this.shouldLog('info')) {
      console.info(
        `${chalk.gray(this.getTimestamp())} ${chalk.cyan.bold('SYSTEM')} ${message}`
      );
    }
  }

  security(message: string, level: 'low' | 'medium' | 'high' | 'critical'): void {
    if (this.shouldLog('info')) {
      const colors = {
        low: chalk.green,
        medium: chalk.yellow,
        high: chalk.red,
        critical: chalk.bgRed.white,
      };
      
      console.info(
        `${chalk.gray(this.getTimestamp())} ${chalk.red.bold('SECURITY')} [${colors[level](
          level.toUpperCase()
        )}] ${message}`
      );
    }
  }
}