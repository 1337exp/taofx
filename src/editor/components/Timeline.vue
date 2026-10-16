<script lang="ts" setup>
import { TaoTimeline } from '@1337exp/taoui';
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';
import { timelineLength, timelineMarks } from '../timeline';

const editor = useEditor();
const { t } = useI18n();

const length = computed(() => (editor.system ? timelineLength(editor.system) : 1));
// Метки без подписей: только черты на шкале (всплески и границы циклов)
const marks = computed(() => (editor.system ? timelineMarks(editor.system, length.value).map((m) => ({ value: m.time, label: '' })) : []));
</script>

<template>
    <div v-if="editor.system" class="timeline">
        <!-- Время ведёт модель воспроизведения из стора (taoux/playback), таймлайн TaoUI только показывает и отдаёт действия -->
        <TaoTimeline
            :model-value="editor.playback.time"
            :playing="editor.playback.playing"
            :length="length"
            :marks="marks"
            size="small"
            @update:model-value="editor.seek"
            @update:playing="editor.setPlaying"
        >
            <template #time="{ time }">{{ time.toFixed(2) }} / {{ length.toFixed(1) }} {{ t('timeline.sec') }}</template>
        </TaoTimeline>
    </div>
</template>

<style scoped>
.timeline {
    padding: 6px 10px;
    border-top: 1px solid var(--tao-color-border, #222733);
    background: var(--tao-color-surface, #0f121a);
    color: var(--tao-color-text, #d6d9e0);
}
</style>
