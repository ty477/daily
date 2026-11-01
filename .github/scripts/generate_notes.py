#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为日常相册里 status == "pending" 的条目生成「生活注脚」（60–120 字）：
读取 content/<year>.json → 调 AI → 写回 aiText / status → commit + push。
未配置 AI_API_KEY 时写入极简占位文本，不阻塞显示。
"""
import glob
import json
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONTENT = os.path.join(ROOT, 'content')

DEFAULT_BASE = 'https://open.bigmodel.cn/api/paas/v4'
DEFAULT_MODEL = 'glm-4.6'

SYSTEM_PROMPT = """你是一位温柔克制的生活记录者，替用户写「日常相册」里每一页的生活注脚。
写作要求：
1. 长度 60–120 字，一小段，不要标题、不要列表。
2. 具体、安静、有画面感，像多年后翻到这一页时仍会微微一笑的小字。
3. 不抒情堆砌、不说教、不总结人生；禁用「时光飞逝」「岁月静好」「人间烟火」「治愈」「满满」这类陈词。
4. 如果用户写了一句话，就围绕它展开，可以呼应时间（清晨/深夜）与季节；不要编造照片里没有、用户也没提到的具体事件。
5. 如果用户没写内容，只写一段克制的、与日期/时间和照片数量相称的小字即可，不要虚构故事。
6. 只输出 JSON：{"text": "注脚全文"}，不要输出任何其他内容。"""


def call_ai(api_key, base_url, model, user_prompt):
    url = base_url.rstrip('/') + '/chat/completions'
    payload = json.dumps({
        'model': model,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': user_prompt},
        ],
        'temperature': 0.8,
        'max_tokens': 800,
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST', headers={
        'Authorization': 'Bearer ' + api_key,
        'Content-Type': 'application/json',
    })
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            return parse_json(data['choices'][0]['message']['content'])
        except Exception as e:  # noqa: BLE001
            last = e
            print(f'  AI 调用失败（第 {attempt + 1} 次）：{e}', flush=True)
            time.sleep(4)
    raise RuntimeError('AI 连续失败：%s' % last)


def parse_json(content):
    text = content.strip()
    if text.startswith('```'):
        text = text.strip('`')
        if text.startswith('json'):
            text = text[4:]
        text = text.strip()
    s, e = text.find('{'), text.rfind('}')
    if s >= 0 and e > s:
        try:
            obj = json.loads(text[s:e + 1])
            if obj.get('text'):
                return obj['text'].strip()
        except json.JSONDecodeError:
            pass
    return content.strip()


def user_prompt(entry):
    d = entry.get('date', '')
    t = entry.get('time', '')
    note = (entry.get('note') or '').strip()
    n = len(entry.get('photos') or [])
    lines = [f'日期：{d}', f'时间：{t or "未记录"}', f'照片：{n} 张']
    if note:
        lines.append(f'用户写的一句话：{note}')
    else:
        lines.append('用户没有写内容。')
    lines.append('请写这一页的生活注脚。')
    return '\n'.join(lines)


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save(path, obj):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write('\n')


def main():
    api_key = (os.environ.get('AI_API_KEY') or '').strip()
    base = (os.environ.get('AI_BASE_URL') or DEFAULT_BASE).strip()
    model = (os.environ.get('AI_MODEL') or DEFAULT_MODEL).strip()

    changed = False
    for fp in sorted(glob.glob(os.path.join(CONTENT, '*.json'))):
        name = os.path.basename(fp)
        if name in ('site.json', 'years.json') or not name[:4].isdigit():
            continue
        try:
            data = load(fp)
        except Exception:
            continue
        entries = data.get('entries') or []
        file_changed = False
        for e in entries:
            if e.get('status') != 'pending':
                continue
            print(f"== 正在生成：{e.get('id')}", flush=True)
            if not api_key:
                e['aiText'] = '（AI 尚未配置——到仓库 Settings → Secrets 添加 AI_API_KEY 后，在 Actions 里手动运行一次「生成生活注脚」）'
                e['status'] = 'ready'
            else:
                try:
                    e['aiText'] = call_ai(api_key, base, model, user_prompt(e))
                    e['status'] = 'ready'
                    print('  完成：' + e['aiText'][:40], flush=True)
                except Exception as err:  # noqa: BLE001
                    print('  失败：' + str(err), flush=True)
                    e['status'] = 'failed'
            file_changed = True
        if file_changed:
            save(fp, data)
            changed = True

    if not changed:
        print('没有待生成的注脚。', flush=True)
        return

    git = lambda *a: subprocess.run(  # noqa: E731
        ['git', '-c', 'user.name=album-bot',
         '-c', 'user.email=action@users.noreply.github.com'] + list(a),
        cwd=ROOT, capture_output=True, text=True)
    git('add', 'content')
    r = git('commit', '-m', 'notes: AI 生成生活注脚 [skip ci]')
    if r.returncode == 0:
        r = git('push')
        if r.returncode == 0:
            print('已提交并推送。', flush=True)
        else:
            print('推送失败：' + r.stderr[-300:], flush=True)
            sys.exit(1)
    else:
        print('没有需要提交的变更。', flush=True)


if __name__ == '__main__':
    main()