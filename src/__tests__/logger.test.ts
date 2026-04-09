import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../utils/logger';

describe('logger', () => {
  it('exposes debug, info, warn, error, fatal as functions', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  describe('JSON output format', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('outputs valid JSON with timestamp, level, and msg', () => {
      logger.info('test message');
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      const output = consoleSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed.level).toBe('info');
      expect(parsed.msg).toBe('test message');
    });

    it('includes meta fields in output', () => {
      logger.info('with meta', { ticker: 'AAOI', price: 42 });
      const output = consoleSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.ticker).toBe('AAOI');
      expect(parsed.price).toBe(42);
    });
  });

  describe('error/fatal use console.error', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('error level writes to console.error', () => {
      logger.error('boom');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(errorSpy.mock.calls[0]![0] as string);
      expect(parsed.level).toBe('error');
    });

    it('fatal level writes to console.error', () => {
      logger.fatal('catastrophe');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(errorSpy.mock.calls[0]![0] as string);
      expect(parsed.level).toBe('fatal');
    });
  });

  describe('level filtering', () => {
    it('debug messages are filtered when LOG_LEVEL is info (default)', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.debug('should not appear');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
