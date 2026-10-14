<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { cn } from '$lib/shared/utils';
  import { groupDigits, reformatMoneyInput } from '$lib/shared/format';
  import { inputClass } from './Input.svelte';

  // value selalu string digit murni ("1500000"); "" berarti kosong.
  export let value = '';
  export let name: string | undefined = undefined;
  export let id: string | undefined = undefined;
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{ input: string }>();

  $: shown = groupDigits(value);

  function onInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const next = reformatMoneyInput(input.value, input.selectionStart ?? input.value.length, shown, (e as InputEvent).inputType);
    input.value = next.text;
    input.setSelectionRange(next.caret, next.caret);
    value = next.value;
    dispatch('input', next.value);
  }
</script>

<input {id} type="text" inputmode="numeric" autocomplete="off" value={shown} class={cn(inputClass, className)} on:input={onInput} {...$$restProps} />
{#if name}
  <input type="hidden" {name} {value} />
{/if}
