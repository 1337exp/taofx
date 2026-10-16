<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';
import { timelineLength, timelineMarks } from '../timeline';

const editor = useEditor();
const { t } = useI18n();

const length = computed(() => (editor.system ? timelineLength(editor.system) : 1));
const marks = computed(() => (editor.system ? timelineMarks(editor.system, length.value) : []));

/** Ручка двигает время: пока тянем, воспроизведение стоит, иначе она убегала бы из-под пальца. */
function onScrub(e: Event) {
    editor.playback.time = Number((e.target as HTMLInputElement).value);
    editor.playback.playing = false;
}
</script>

<template>
    <div v-if="editor.system" class="timeline">
        <TaoButton size="small" variant="secondary" :aria-label="editor.playback.playing ? t('timeline.pause') : t('timeline.play')" @click="editor.playback.playing = !editor.playback.playing">
            {{ editor.playback.playing ? '❚❚' : '▶' }}
        </TaoButton>
        <TaoButton size="small" variant="ghost" :aria-label="t('timeline.restart')" @click="editor.playback.time = 0">⏮</TaoButton>
        <div class="track">
            <span v-for="(m, i) in marks" :key="i" class="mark" :class="m.kind" :style="{ left: `${(m.time / length) * 100}%` }" />
            <input type="range" min="0" :max="length" step="0.01" :value="editor.playback.time" :aria-label="t('timeline.scrub')" @input="onScrub" />
        </div>
        <span class="time">{{ editor.playback.time.toFixed(2) }} / {{ length.toFixed(1) }} {{ t('timeline.sec') }}</span>
    </div>
</template>

<style scoped>
.timeline {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-top: 1px solid var(--tao-color-border, #222733);
    background: var(--tao-color-surface, #0f121a);
    color: var(--tao-color-text, #d6d9e0);
    font-size: 12px;
}

.track {
    position: relative;
    flex: 1;
    height: 22px;
}

.track input {
    position: absolute;
    inset: 0;
    width: 100%;
    margin: 0;
    background: none;
}

.mark {
    position: absolute;
    top: 2px;
    width: 2px;
    height: 18px;
    pointer-events: none;
}

.mark.burst {
    background: #ffb74d;
}

.mark.cycle {
    background: #4a62b8;
}

.time {
    min-width: 110px;
    color: #8b929c;
    text-align: right;
    font-variant-numeric: tabular-nums;
}
</style>
