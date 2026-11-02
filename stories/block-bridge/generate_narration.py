"""以本機 MeloTTS 模型逐句生成故事旁白；無雲端語音呼叫。"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
import sherpa_onnx
import soundfile as sf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--script', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--speed', type=float, default=.78)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('輸出目錄已存在，請指定新目錄，以保留前一版。')
    if not .5 <= args.speed <= 1.5:
        parser.error('語速請設在0.5至1.5之間。')
    pages = json.loads(args.script.read_text(encoding='utf-8'))['pages']
    model = args.model_dir
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(model / 'model.onnx'), tokens=str(model / 'tokens.txt'),
                lexicon=str(model / 'lexicon.txt')),
            num_threads=2, provider='cpu'), max_num_sentences=1)
    if not config.validate():
        parser.error('模型設定無效，請檢查模型檔與字典。')
    tts = sherpa_onnx.OfflineTts(config)
    args.output.mkdir(parents=True)
    manifest = {'engine': 'sherpa-onnx', 'model': 'MeloTTS-Chinese',
                'voice': '合成女聲試聽版', 'speed': args.speed, 'pages': []}
    cache = {}
    for page in pages:
        audio = []
        cues = []
        offset = 0
        for text in page['text'].splitlines():
            # 字幕保留原文；語音移除引號，將冒號變成可辨識的停頓。
            spoken = text.replace('「', '').replace('」', '').replace('：', '，')
            if spoken not in cache:
                result = tts.generate(spoken, sid=0, speed=args.speed)
                cache[spoken] = (np.asarray(result.samples), result.sample_rate)
            samples, rate = cache[spoken]
            duration = len(samples) / rate
            if duration <= .1 or not np.isfinite(samples).all():
                raise RuntimeError('語音產生失敗：' + page['id'])
            cues.append({'start': offset, 'end': offset + duration, 'text': text})
            gap = np.zeros(round(.35 * rate), dtype=np.float32)
            audio.extend([samples, gap])
            offset += (len(samples) + len(gap)) / rate
        samples = np.concatenate(audio)
        wav = args.output / (page['id'] + '.wav')
        mp3 = args.output / (page['id'] + '.mp3')
        sf.write(wav, samples, rate, subtype='PCM_16')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(wav),
                        '-c:a', 'libmp3lame', '-b:a', '96k', str(mp3)], check=True)
        manifest['pages'].append({'id': page['id'], 'mode': page['mode'], 'file': mp3.name,
                                 'seconds': round(len(samples) / rate, 6), 'cues': cues,
                                 'sha256': hashlib.sha256(mp3.read_bytes()).hexdigest()})
        print(page['id'], round(len(samples) / rate, 2), '秒', flush=True)
    (args.output / 'narration-assets.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
