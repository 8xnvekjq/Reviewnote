import { YoutubeTranscript } from 'youtube-transcript';
async function test() {
  try {
    console.log("Fetching ko transcript...");
    const t = await YoutubeTranscript.fetchTranscript('ksobN_pSjCs', { lang: 'ko' });
    console.log("Ko success:", JSON.stringify(t.slice(0, 5)));
  } catch (e) {
    console.log("Ko failed. Fetching default transcript...");
    try {
      const t = await YoutubeTranscript.fetchTranscript('ksobN_pSjCs');
      console.log("Default success:", JSON.stringify(t.slice(0, 5)));
    } catch (err) {
      console.error("All failed:", err);
    }
  }
}
test();
