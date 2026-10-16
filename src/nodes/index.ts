import { Registry } from '../graph/registry';
import type { NodeDef } from '../graph/types';

// Определения нод подхватываются автоматически: файл в src/nodes/<категория>/<имя>.ts с default-экспортом `defineNode(...)`.
const modules = import.meta.glob<{ default: NodeDef }>('./*/*.ts', { eager: true });

export function createDefaultRegistry(): Registry {
    const registry = new Registry();
    for (const path of Object.keys(modules).sort()) registry.register(modules[path]!.default);
    return registry;
}
