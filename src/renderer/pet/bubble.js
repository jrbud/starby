// Speech bubble UI. Behaviors call ctx.say(text, ms) rather than touching this directly.

export function createBubble(el) {
  let hideTimer = null;
  return {
    say(text, ms = 3000) {
      el.textContent = text;
      el.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => el.classList.add('hidden'), ms);
    },
    isShowing: () => !el.classList.contains('hidden'),
    /** Hide right now (e.g. a video call just started, see events/hush.js). */
    hide() {
      clearTimeout(hideTimer);
      el.classList.add('hidden');
    },
  };
}
