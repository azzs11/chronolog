import { TemplateStream, type StreamLine } from '../src';

const line = (timestamp: number, message: string, severity = 'info', service = 'api'): StreamLine => ({ timestamp, service, severity, message });

describe('TemplateStream', () => {
  it('groups messages that differ only in numbers and ids, and counts them', () => {
    const stream = new TemplateStream();
    stream.add(line(1, 'user 12 logged in'));
    stream.add(line(2, 'user 99 logged in'));
    stream.add(line(3, 'disk full on /dev/sda1'));
    expect(stream.size).toBe(2);
    const groups = stream.groups();
    expect(groups.find((g) => g.template.startsWith('user'))?.count).toBe(2);
  });

  it('says when a line creates a template nobody has logged before', () => {
    const stream = new TemplateStream();
    expect(stream.add(line(1, 'cache hit key 5')).isNewTemplate).toBe(true);
    expect(stream.add(line(2, 'cache hit key 9')).isNewTemplate).toBe(false);
    expect(stream.add(line(3, 'cache evicted all keys now')).isNewTemplate).toBe(true);
  });

  it('tracks first and last seen, severities, services and the most severe level', () => {
    const stream = new TemplateStream();
    stream.add(line(10, 'job 1 failed', 'warning', 'worker'));
    stream.add(line(5, 'job 2 failed', 'error', 'worker'));
    stream.add(line(20, 'job 3 failed', 'info', 'queue'));
    const [group] = stream.groups();
    expect(group).toMatchObject({ count: 3, firstSeen: 5, lastSeen: 20, highestSeverity: 'error' });
    expect(group?.bySeverity).toEqual({ warning: 1, error: 1, info: 1 });
    expect(group?.byService).toEqual({ worker: 2, queue: 1 });
  });

  it('keeps only the most recent raw samples', () => {
    const stream = new TemplateStream(3);
    for (let i = 1; i <= 6; i++) stream.add(line(i, `request ${i} done`));
    expect(stream.groups()[0]?.samples).toEqual(['request 4 done', 'request 5 done', 'request 6 done']);
  });

  it('lists the most recently seen group first and generalises a template as variants arrive', () => {
    const stream = new TemplateStream();
    stream.add(line(1, 'connect to cache failed'));
    stream.add(line(2, 'unrelated thing happened here today'));
    stream.add(line(3, 'connect to queue failed'));
    const groups = stream.groups();
    expect(groups[0]?.template).toBe('connect to <*> failed');
    expect(groups).toHaveLength(2);
  });

  it('starts over after reset', () => {
    const stream = new TemplateStream();
    stream.add(line(1, 'hello world'));
    stream.reset();
    expect(stream.size).toBe(0);
    expect(stream.add(line(2, 'hello world')).isNewTemplate).toBe(true);
  });
});
