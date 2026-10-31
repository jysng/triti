// @ts-check
// Web Speech API dictation. Not available in Firefox. In Chrome/Edge audio is
// processed by the browser vendor's servers, so the UI asks for consent first.

const w = /** @type {any} */ (window);
const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;

export const voiceSupported = Boolean(Recognition);

/**
 * @param {{ onText: (finalText: string, interim: string) => void,
 *   onEnd?: () => void, onError?: (error: string) => void, lang?: string }} handlers
 * @returns {() => void} stop
 */
export function startDictation({ onText, onEnd, onError, lang }) {
  const r = new Recognition();
  r.continuous = true;
  r.interimResults = true;
  r.lang = lang || navigator.language || 'en-US';
  r.onresult = (/** @type {any} */ e) => {
    let finalText = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    onText(finalText, interim);
  };
  r.onerror = (/** @type {any} */ e) => onError?.(e.error);
  r.onend = () => onEnd?.();
  r.start();
  return () => r.stop();
}
