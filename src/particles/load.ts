import { EffectLoadError } from '../graph/load';
import type { Registry } from '../graph/registry';
import { PARTICLES_FORMAT, PARTICLES_VERSION, parseParticles } from './serialize';
import type { ParticleFile } from './types';

/**
 * Файл частиц из текста или из готового объекта. В обоих случаях строгий разбор (бросает `EffectLoadError`):
 * объект тоже проходит проверку, так что недостающие поля системы берутся по умолчанию и новые рантайму не мешают старым файлам.
 */
export function loadParticleFile(source: string | ParticleFile, registry: Registry): ParticleFile {
    const text = typeof source === 'string' ? source : JSON.stringify({ format: PARTICLES_FORMAT, version: PARTICLES_VERSION, system: source.system, material: source.material });
    const result = parseParticles(text, registry);
    if (!result.ok) throw new EffectLoadError(result.error);
    return result.file;
}
