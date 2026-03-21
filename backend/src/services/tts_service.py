import io
import asyncio
import soundfile as sf
from kokoro import KPipeline

class TTSService:
    def __init__(self, lang_code: str = 'a', default_voice: str = 'af_heart'):
        """
        Initializes the Kokoro TTS Pipeline. 
        'a' is for American English. 'af_heart' is a high-quality default female voice.
        """
        print("Loading Kokoro TTS model into memory... This might take a moment.")
        
        # KPipeline handles downloading and loading the 82M parameter model automatically.
        # It is highly efficient and runs great on CPU or GPU.
        self.pipeline = KPipeline(lang_code=lang_code)
        self.default_voice = default_voice
        self.sample_rate = 24000 # Kokoro natively outputs at 24kHz
        
        print("Kokoro TTS Model loaded successfully!")

    def _generate_audio_sync(self, text: str):
        """
        Synchronous helper function to run the Kokoro model.
        We separate this so we don't block the FastAPI async event loop.
        """
        # Kokoro returns a generator. Because we already chunked our text into 
        # single sentences, this will usually just yield exactly one audio segment.
        generator = self.pipeline(
            text, 
            voice=self.default_voice, 
            speed=1.0,
            split_pattern=r'\n+' 
        )
        
        # Collect the generated numpy audio arrays
        audio_segments = []
        for _, _, audio in generator:
            if audio is not None:
                audio_segments.append(audio)
                
        return audio_segments

    async def generate_audio_stream(self, sentences: list):
        """
        Takes a list of sentence dictionaries, generates audio using Kokoro,
        and yields the audio bytes in WAV format.
        """
        for sentence in sentences:
            sentence_id = sentence["id"]
            text = sentence["text"]
            
            # Run the heavy AI generation in a background thread so it doesn't freeze the server
            audio_segments = await asyncio.to_thread(self._generate_audio_sync, text)
            
            for audio in audio_segments:
                # 'audio' is a raw numpy array. Browsers need WAV/MP3 bytes.
                # We use an in-memory buffer to convert it instantly without writing to the hard drive.
                buffer = io.BytesIO()
                
                # Write the numpy array to the buffer as a WAV file
                sf.write(buffer, audio, self.sample_rate, format='WAV')
                
                # Move the buffer cursor back to the beginning so it can be read
                buffer.seek(0)
                audio_bytes = buffer.getvalue()
                
                # Yield the exact dictionary structure our WebSocket expects
                yield {
                    "sentence_id": sentence_id,
                    "audio_bytes": audio_bytes
                }