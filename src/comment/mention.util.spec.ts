import { extractMentions } from './mention.util';

describe('extractMentions', () => {
  it('should extract a single mention', () => {
    expect(extractMentions('Hello @alice')).toEqual(['alice']);
  });

  it('should extract multiple mentions', () => {
    const result = extractMentions('@alice please review with @bob');
    expect(result).toEqual(['alice', 'bob']);
  });

  it('should return unique results (deduplication)', () => {
    const result = extractMentions('@alice @bob @alice');
    expect(result).toEqual(['alice', 'bob']);
  });

  it('should be case-insensitive and lowercase all results', () => {
    const result = extractMentions('@Alice @BOB @Charlie');
    expect(result).toEqual(['alice', 'bob', 'charlie']);
  });

  it('should return an empty array when there are no mentions', () => {
    expect(extractMentions('No mentions here')).toEqual([]);
  });

  it('should not match email addresses', () => {
    expect(extractMentions('Contact user@example.com')).toEqual([]);
  });

  it('should handle mentions with underscores and digits', () => {
    const result = extractMentions('@user_123 and @dev42');
    expect(result).toEqual(['user_123', 'dev42']);
  });

  it('should handle mention at the start of the string', () => {
    expect(extractMentions('@admin check this')).toEqual(['admin']);
  });

  it('should handle empty string', () => {
    expect(extractMentions('')).toEqual([]);
  });
});
