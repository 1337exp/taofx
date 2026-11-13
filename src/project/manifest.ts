// `project.json`: заголовок проекта. Каталога ресурсов тут нет: проект сканируется (так при хранении папкой в git
// две правки разных файлов не конфликтуют в одном общем списке).

export const PROJECT_FILE = 'project.json';
export const PROJECT_FORMAT = 'taofx-project';
export const PROJECT_VERSION = 1;

export interface ProjectSettings {
    /** Пикселей на единицу системы частиц (в 2D). Берут редактор и сборка бандла. */
    pixelsPerUnit: number;
}

export interface Manifest {
    format: typeof PROJECT_FORMAT;
    version: number;
    name: string;
    settings: ProjectSettings;
}

export const MAX_NAME = 200;

export const defaultSettings = (): ProjectSettings => ({ pixelsPerUnit: 100 });

export function createManifest(name: string): Manifest {
    return { format: PROJECT_FORMAT, version: PROJECT_VERSION, name: name.trim().slice(0, MAX_NAME), settings: defaultSettings() };
}

export const serializeManifest = (manifest: Manifest): string => JSON.stringify(manifest, null, 2) + '\n';

export type ManifestError = 'invalidJson' | 'notProject' | 'newerVersion' | 'invalidStructure';

export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; error: ManifestError };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Читает `project.json`. Не бросает: ошибка это результат. Не указанные настройки берутся по умолчанию. */
export function parseManifest(text: string): ManifestResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, error: 'invalidJson' };
    }
    if (!isObj(raw) || raw.format !== PROJECT_FORMAT) return { ok: false, error: 'notProject' };
    if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) return { ok: false, error: 'invalidStructure' };
    if (raw.version > PROJECT_VERSION) return { ok: false, error: 'newerVersion' };
    if (typeof raw.name !== 'string' || raw.name.length > MAX_NAME) return { ok: false, error: 'invalidStructure' };

    const settings = defaultSettings();
    if (raw.settings !== undefined) {
        if (!isObj(raw.settings)) return { ok: false, error: 'invalidStructure' };
        const ppu = raw.settings.pixelsPerUnit;
        if (ppu !== undefined) {
            if (typeof ppu !== 'number' || !Number.isFinite(ppu) || ppu <= 0) return { ok: false, error: 'invalidStructure' };
            settings.pixelsPerUnit = ppu;
        }
    }
    return { ok: true, manifest: { format: PROJECT_FORMAT, version: raw.version, name: raw.name, settings } };
}
