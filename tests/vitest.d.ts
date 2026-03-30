import { describe, test, expect, beforeEach, afterEach } from 'vitest';

declare global {
    const describe: typeof import('vitest').describe;
    const test: typeof import('vitest').test;
    const expect: typeof import('vitest').expect;
    const beforeEach: typeof import('vitest').beforeEach;
    const afterEach: typeof import('vitest').afterEach;
}
