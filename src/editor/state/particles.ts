import { createPlayback } from '@1337exp/taoux/playback';
import { computed, reactive, watch, type Ref } from 'vue';
import { DEMO_PARTICLES } from '@/demoParticles';
import { defaultSystem } from '@/particles/serialize';
import type { SystemDef } from '@/particles/types';
import type { EditorDoc } from '../doc';
import { timelineLength } from '../timeline';

export interface ParticleDeps {
    /** Параметры системы частиц документа; null: документ это обычный материал. */
    system: Ref<SystemDef | null>;
    /** Записать шаг в историю (серия правок одного ключа склеивается). */
    commit(key?: string): void;
    /** Заменить документ целиком (стартовая система) вместе с камерой. */
    load(doc: EditorDoc, view: { x: number; y: number; z: number }): void;
}

/**
 * Документ как система частиц: параметры, воспроизведение предпросмотра и переходы между «материал» и «частицы».
 * Воспроизведение (в историю и файл не входит) ведёт модель из taoux, здесь её отражение для интерфейса.
 * Цикл всегда включён (полоска показывает несколько циклов системы), играет только пока документ это система частиц.
 */
export function useParticleDoc({ system, commit, load }: ParticleDeps) {
    const clip = createPlayback({ length: 2, loop: true });
    const playback = reactive({ playing: false, time: 0 });
    clip.subscribe((s) => {
        playback.playing = s.playing;
        playback.time = s.time;
    });

    /** Ключ параметров системы: меняется, когда частицы нужно пересобрать. */
    const systemKey = computed(() => JSON.stringify(system.value));

    watch(
        () => (system.value ? timelineLength(system.value) : null),
        (length) => {
            if (length) clip.setLength(length);
        },
        { immediate: true },
    );
    watch(
        () => system.value !== null,
        (isParticles) => (isParticles ? clip.play() : clip.pause()),
        { immediate: true },
    );

    /** Правит параметры системы; серия правок одного `key` склеивается в один шаг истории. */
    function updateSystem(key: string, change: (s: SystemDef) => void) {
        if (!system.value) return;
        change(system.value);
        commit(`system:${key}`);
    }

    /** Включает частицы в текущем документе: материал остаётся, добавляются параметры по умолчанию. */
    function enableParticles() {
        if (system.value) return;
        system.value = defaultSystem();
        clip.restart();
        commit();
    }

    /** Возвращает документ к обычному материалу. */
    function disableParticles() {
        if (!system.value) return;
        system.value = null;
        commit();
    }

    let fitRequested = false;

    /** Заменяет документ стартовой системой частиц (фонтан); отменяется как обычная правка. */
    function startParticles() {
        load(JSON.parse(JSON.stringify(DEMO_PARTICLES)) as EditorDoc, { x: 0, y: 0, z: 1 });
        clip.restart();
        fitRequested = true;
    }

    /** Просьба «показать всё» после загрузки стартовой системы: вид забирает её один раз, когда ноды уже нарисованы. */
    function takeFitRequest(): boolean {
        const v = fitRequested;
        fitRequested = false;
        return v;
    }

    return {
        playback,
        systemKey,
        /** Перемотка предпросмотра на `time` секунд. */
        seek: clip.seek,
        /** Включает и выключает воспроизведение предпросмотра. */
        setPlaying: (on: boolean) => (on ? clip.play() : clip.pause()),
        updateSystem,
        enableParticles,
        disableParticles,
        startParticles,
        takeFitRequest,
    };
}
