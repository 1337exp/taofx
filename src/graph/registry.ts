import type { NodeDef } from './types';

export class Registry {
    private defs = new Map<string, NodeDef>();

    register(def: NodeDef): this {
        if (this.defs.has(def.id)) throw new Error(`Node type "${def.id}" is already registered`);
        this.defs.set(def.id, def);
        return this;
    }

    has(id: string): boolean {
        return this.defs.has(id);
    }

    get(id: string): NodeDef | undefined {
        return this.defs.get(id);
    }

    all(): NodeDef[] {
        return [...this.defs.values()];
    }
}

export const defineNode = (def: NodeDef): NodeDef => def;
