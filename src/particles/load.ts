import { EffectLoadError } from '../graph/load';
import type { Registry } from '../graph/registry';
import { parseParticles } from './serialize';
import type { ParticleFile } from './types';

/** Файл частиц из текста (строгий разбор, бросает `EffectLoadError`) или готовый объект как есть. */
export function loadParticleFile(source: string | ParticleFile, registry: Registry): ParticleFile {
    if (typeof source !== 'string') return source;
    const result = parseParticles(source, registry);
    if (!result.ok) throw new EffectLoadError(result.error);
    return result.file;
}
