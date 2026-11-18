import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');

describe('engine purity', () => {
  it('imports nothing but relative modules (no Express, Socket.io, Node built-ins)', () => {
    for (const file of readdirSync(SRC).filter((f) => f.endsWith('.ts'))) {
      const imports = [...readFileSync(join(SRC, file), 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) expect(spec, `${file} imports ${spec}`).toMatch(/^\.\.?\//);
    }
  });

  it('declares no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { dependencies?: object };
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
