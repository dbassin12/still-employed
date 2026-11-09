"""Play the real game in the real Safari on this Mac, at iPhone width, and report what happened.

  python3 tools/safari_check.py

Safari is the same family of engine as an iPhone, and the students are mostly on phones. This plays a clean run
and a firing through to the report, and renders the sound with Safari's own audio engine. It cannot tap for real, so
it cannot prove audio starts after a tap on an iPhone, and it cannot hear anything. Serves only the game page and the
check page, only on 127.0.0.1. Works with the screen off: the check page paces itself without timers, because Safari
all but stops timers in a hidden page. Closes the tabs it opened when it can.
"""
import json
import pathlib
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8753  # free in the machine's port list; never 3000
ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / 'dist' / 'index.html'
FILES = {'/check.html': ROOT / 'tools' / 'safari_check.html', '/dist/index.html': GAME}
report = {}
done = threading.Event()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = FILES.get(self.path.split('?')[0])
        if not path:
            self.send_response(404)
            self.end_headers()
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        self.send_response(200)
        self.end_headers()
        if self.path == '/report':
            report.update(body)
            done.set()


CLOSE_TABS = f'''
tell application "Safari"
  set closedCount to 0
  repeat with w in (every window)
    repeat with t in (every tab of w)
      if (URL of t) contains "127.0.0.1:{PORT}" then
        close t
        set closedCount to closedCount + 1
      end if
    end repeat
  end repeat
  return closedCount
end tell
'''


def main():
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    subprocess.run(['open', '-g', '-a', 'Safari', f'http://127.0.0.1:{PORT}/check.html'], check=True)
    finished = done.wait(180)
    server.shutdown()
    try:
        closed = subprocess.run(['osascript', '-e', CLOSE_TABS], capture_output=True, text=True, timeout=15)
        print('closed tabs:', closed.stdout.strip() or closed.stderr.strip()[:120])
    except subprocess.TimeoutExpired:
        print('could not close the check tabs: Safari did not answer')
    if not finished:
        print('NO REPORT: Safari did not finish in 3 minutes')
        sys.exit(1)
    print(report['ua'].split(') ')[-1])
    print(f'clean run: {report.get("tasksPlayed")} tasks across {len(report.get("verbs", []))} question types; screens: {", ".join(report.get("screens", []))}')
    print('firing run ended on:', report.get('firedRun', {}).get('lastScreen'))
    print('sound render:', report.get('render'))
    problems = report.get('errors', []) + report.get('overflow', []) + report.get('covered', [])
    if report.get('render', {}).get('bad') or not report.get('hasGame'):
        problems.append('render or game failed')
    if problems:
        print(f'{len(problems)} PROBLEMS')
        for line in problems[:20]:
            print(' -', line)
        sys.exit(1)
    print('ALL CHECKS PASSED')


if __name__ == '__main__':
    main()
