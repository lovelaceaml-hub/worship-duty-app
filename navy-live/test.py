"""Browser regression suite for the OPTIONAL theme. All external requests are intercepted.
Run: python -m pip install playwright && python -m playwright install chromium
     python navy-live/test.py
CHROMIUM_PATH can point to an existing browser. No Firebase credentials are used.
"""
import os, json, hashlib, threading, functools, traceback
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

STANDALONE=os.environ.get('STANDALONE')=='1'
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'evidence'; OUT.mkdir(exist_ok=True)
REPORT={'passed':[], 'failed':[], 'console_errors':[], 'external_requests_blocked':[], 'deployment':'Not deployed by tests', 'mode':'standalone local fixture' if STANDALONE else 'HTTP isolated fixture'}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)
KEY='wds-appearance-navy-v1'
PIN=hashlib.sha256(b'2468').hexdigest()
EDITOR=hashlib.sha256(b'1357').hexdigest()
FIXTURE={'members':['B. Anthony','B. Brent','B. Davidson','B. Giomar','D. Chloe','E. Simon'], 'services':[], 'departments':{}, 'requests':[], 'settings':{'sitePinHash':PIN,'pinHash':EDITOR,'features':{'siteLock':True,'editorLock':True,'sheetSync':False,'notifications':False,'reminders':False}}}
for day,time,label,presider in [(12,'09:00','Morning','B. Giomar'),(12,'15:00','Afternoon','B. Davidson'),(12,'20:00','Evening','B. Giomar'),(15,'20:00','Evening','B. Giomar'),(19,'09:00','Morning','B. Davidson')]:
    FIXTURE['services'].append({'date':f'2026-09-{day}', 'time':time,'service':label,'worship':'Third Day' if day==15 else 'Sabbath Day','choirSong':'Sample choir song','assignments':{'Presider':presider,'Sermon':'E. Simon','Prayer of Thanks':'B. Brent','Closing Prayer':'D. Chloe','Usher #2':'B. Anthony'}})

def check(name, condition=True):
    assert condition, name
    REPORT['passed'].append(name)

def click_tab(page,name):
    page.locator(f'nav.tabs [data-tab="{name}"]').click()
    page.wait_for_timeout(100)

def set_choice(page,design):
    page.locator('#nc-appearance').click()
    page.locator(f'.nc-dialog-actions [data-design="{design}"]').click()

def snap(page,name):
    page.screenshot(path=str(OUT/(name+'.png')),full_page=True,animations='disabled')

def make_context(browser, prefs=None, unlocked=False):
    ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block',timezone_id='America/Los_Angeles',reduced_motion='reduce')
    init=f"""const RealDate=Date;window.Date=class extends RealDate{{constructor(...a){{super(...(a.length?a:['2026-09-10T17:00:00Z']));}}static now(){{return new RealDate('2026-09-10T17:00:00Z').getTime();}}}};
    if(!localStorage.getItem('wds-data-v2')){{localStorage.setItem('wds-data-v2',JSON.stringify({json.dumps(FIXTURE)}));localStorage.setItem('wds-me','B. Giomar');}}
    """
    if prefs is not None: init+=f"if(!localStorage.getItem('{KEY}'))localStorage.setItem('{KEY}',{json.dumps(json.dumps(prefs))});"
    if unlocked: init+=f"localStorage.setItem('wds-site-unlock','{PIN}');"
    ctx._fixture_init=init
    if not STANDALONE: ctx.add_init_script(init)
    else: ctx.expose_function('fixtureDigest',lambda values:list(hashlib.sha256(bytes(values)).digest()))
    def route(r):
        url=r.request.url
        if url.startswith(BASE):
            if '/firebase-config.js' in url:r.fulfill(status=200,content_type='application/javascript',body='window.FIREBASE_CONFIG=null;')
            else:r.continue_()
        else:
            REPORT['external_requests_blocked'].append({'method':r.request.method,'url':url.split('?')[0]})
            r.abort()
    ctx.route('**/*',route)
    return ctx


def go(page, saved=None):
    if not STANDALONE:
        page.goto(BASE)
        return
    import re
    read=lambda n:(ROOT/'dist'/n).read_text()
    app=read('app.js').replace('function loadSongAssets() {','function loadSongAssets() { return Promise.resolve(); ')
    app=app.replace("import('./song-app.js' + ASSET_V)",'Promise.resolve(window.FixtureSongModule)')
    song=read('song-app.js').replace('export function mount(', 'function mount(')
    memory=f"""(function(){{const values={json.dumps(saved or {})};Object.defineProperty(window,'localStorage',{{value:{{getItem:k=>values[k]??null,setItem:(k,v)=>{{values[k]=String(v)}},removeItem:k=>{{delete values[k]}},clear:()=>{{for(const k of Object.keys(values))delete values[k]}},key:i=>Object.keys(values)[i]||null,get length(){{return Object.keys(values).length}}}}}});Object.defineProperty(crypto,'subtle',{{value:{{digest:async(a,b)=>new Uint8Array(await fixtureDigest(Array.from(b))).buffer}}}});}})();"""
    original_style=re.search(r'<style>([\s\S]*?)</style>',read('index.html')).group(1)
    body=re.search(r'<body>([\s\S]*?)</body>',read('index.html')).group(1)
    body=re.sub(r'<script[\s\S]*?</script>','',body)
    scripts=[memory,'(function(){'+page.context._fixture_init+'})();','window.FIREBASE_CONFIG=null;',read('seed-data.js'),read('song-seed.js'),read('song-lib.js'),read('navy-choice.js'),'(function(){'+song+'\nwindow.FixtureSongModule={mount};})();','(function(){'+app+'})();']
    escaped=[x.replace('</script','<\\/script') for x in scripts]
    html='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#2383c6"><style>'+original_style+'\n'+read('song-app.css')+'\n'+read('navy-choice.css')+'</style><style id="navy-theme-css" media="not all">'+read('navy-theme.css')+'</style></head><body>'+body+'\n'.join('<script>'+x+'</script>' for x in escaped)+'</body></html>'
    page.set_content(html,wait_until='load')

def again(page):
    if not STANDALONE:
        page.reload()
        return page
    saved=page.evaluate('Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>{const k=localStorage.key(i);return [k,localStorage.getItem(k)]}))')
    ctx=page.context;page.close();page=ctx.new_page();page.on('pageerror',lambda e:REPORT['console_errors'].append(str(e)));go(page,saved);return page

try:
    with sync_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH')
        browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        ctx=make_context(browser)
        page=ctx.new_page(); page.on('pageerror',lambda e:REPORT['console_errors'].append(str(e)))
        go(page); page.wait_for_selector('#site-pin-input')
        page.wait_for_timeout(1000)
        check('Original is the default before an explicit choice',page.locator('html').get_attribute('data-zion-design')=='original')
        check('No design offer or Appearance control before site unlock',page.locator('dialog[open]').count()==0 and not page.locator('#nc-appearance').is_visible())
        page.locator('#site-pin-input').fill('2468');page.get_by_role('button',name='Enter',exact=True).click()
        page.wait_for_selector('#nc-choice[open]');snap(page,'appearance-offer-mobile')
        check('Post-unlock offer explains Original, new design and switching back',all(s in page.locator('#nc-choice').inner_text() for s in ['Original','Navy & Cream','switch back']))
        page.locator('.nc-dialog-actions [data-design="original"]').click()
        page=again(page);page.wait_for_timeout(1100)
        check('Declining the offer is remembered without prompting again',page.locator('dialog[open]').count()==0)
        before=page.evaluate("localStorage.getItem('wds-data-v2')")
        set_choice(page,'navy')
        check('Navy theme is enabled only after choosing it',page.locator('html').get_attribute('data-zion-design')=='navy')
        check('Appearance changes do not write the schedule',page.evaluate("localStorage.getItem('wds-data-v2')")==before)
        check('The new layout has date and time controls',page.locator('.nc-date-rail button').count()==3 and page.locator('.nc-times button').count()==3)
        check('A real native service card remains in the selected-day layout',page.locator('[data-nc-selected]').count()==1 and 'B. Giomar' in page.locator('[data-nc-selected]').inner_text())
        snap(page,'schedule-mobile')
        page.locator('.nc-times button').nth(1).click()
        check('Service selection changes to the actual 3 PM service','3:00 PM' in page.locator('.nc-hero').inner_text())
        page.locator('[data-nc-act="full-mode"]').click()
        check('Full schedule retains all five native services',page.locator('#view > .card:visible').count()==5)
        page.locator('[data-nc-act="day-mode"]').click()
        page.locator('[data-nc-act="month"][data-delta="1"]').click()
        check('Empty months use an honest empty state',page.locator('.nc-empty').is_visible())
        page.locator('[data-nc-act="month"][data-delta="-1"]').click()
        click_tab(page,'my');snap(page,'my-duties-mobile')
        check('My Duties keeps calendar, requests and team expanders',page.locator('[data-act="subscribe-ics"]').count()==1 and page.locator('[data-act="req-open"]').count()>0 and page.locator('.who-else').count()>0)
        page.locator('[data-act="req-open"]').first.click()
        page.locator('.req-form textarea').fill('Keep this unsent note across appearance changes.')
        set_choice(page,'original')
        check('Unsent request note survives return to Original',page.locator('.req-form textarea').input_value()=='Keep this unsent note across appearance changes.')
        set_choice(page,'navy')
        check('Unsent request note survives switching back to Navy',page.locator('.req-form textarea').input_value()=='Keep this unsent note across appearance changes.')
        page.locator('[data-act="req-cancel"]').click()
        click_tab(page,'manage')
        check('Editor lock is still enforced',page.locator('#pin-input').is_visible())
        snap(page,'manage-lock-mobile')
        page.locator('#pin-input').fill('1357');page.get_by_role('button',name='Unlock',exact=True).click()
        page.wait_for_selector('.nc-stats');snap(page,'manage-mobile')
        check('Management summaries use actual upcoming service counts','5'==page.locator('.nc-stats strong').first.inner_text())
        page.locator('[data-act="expand"][data-id^="m:"]').first.click()
        page.locator('select[data-chg="assign"][data-duty="Usher #2"]').first.select_option('B. Brent')
        check('Intentional one-prayer plus one-usher exception is preserved',page.locator('select[data-chg="assign"][data-duty="Usher #2"]').first.get_attribute('class')!='conflict')
        page.locator('select[data-chg="assign"][data-duty="Presider"]').first.select_option('B. Brent')
        check('Other duplicate-role assignments still warn',page.locator('select[data-chg="assign"][data-duty="Presider"]').first.get_attribute('class')=='conflict')
        page.locator('select[data-chg="assign"][data-duty="Presider"]').first.select_option('B. Giomar')
        for sub in ['planning','requests','people','features','data']:
            page.locator(f'[data-act="sub"][data-sub="{sub}"]').click();page.wait_for_timeout(80)
            check(f'Manage / {sub} retains its native content',page.locator('#view').inner_text().strip()!='' and page.locator('.nc-heading h2').count()==1)
            snap(page,'manage-'+sub+'-mobile')
        page.locator('[data-sub="people"]').click();page.locator('#member-name').fill('Unsubmitted example member')
        set_choice(page,'original');check('Unsubmitted new-person form survives design changes',page.locator('#member-name').input_value()=='Unsubmitted example member')
        set_choice(page,'navy')
        click_tab(page,'songs');page.wait_for_selector('#song-root .ns-tabs');snap(page,'presider-home-mobile')
        for tab in ['library','services','insights']:
            target=page.locator(f'#song-root .ns-tabs [data-tab="{tab}"]')
            if not target.count(): target=page.locator('#song-root .ns-tabs button').filter(has_text={'library':'Library','services':'Services','insights':'Insights'}[tab])
            target.click();page.wait_for_timeout(150)
            check(f'Presider / {tab} works with the shared theme',page.locator('#song-root .ns-tabs button.active').inner_text().lower()==tab)
            snap(page,'presider-'+tab+'-mobile')
        # Switching appearance does not remount or navigate the nested song app.
        active=page.locator('#song-root .ns-tabs button.active').inner_text()
        set_choice(page,'original');set_choice(page,'navy')
        check('Design switch preserves the current Presider subpage',page.locator('#song-root .ns-tabs button.active').inner_text()==active)
        page.locator('#nc-appearance').click();page.locator('#nc-scheme').select_option('dark');page.locator('#nc-motion').select_option('off');page.locator('[data-nc-act="dismiss"]').click()
        click_tab(page,'schedule');snap(page,'schedule-dark-mobile')
        check('Dark mode covers native card surfaces',page.locator('.card:visible').first.evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(36, 57, 67)')
        check('Explicit reduced motion disables hero animation',page.locator('.nc-hero').evaluate('(e)=>getComputedStyle(e,"::after").animationName')=='none')
        page.locator('#nc-appearance').click();page.locator('#nc-scheme').select_option('light');page.locator('#nc-motion').select_option('auto');page.locator('[data-nc-act="dismiss"]').click()
        check('Operating-system reduced motion overrides animation preference',page.locator('.nc-hero').evaluate('(e)=>getComputedStyle(e,"::after").animationName')=='none')
        for width in [320,390,768,1440]:
            page.set_viewport_size({'width':width,'height':940})
            for tab in ['schedule','my','manage','songs']:
                click_tab(page,tab)
                check(f'No page-level horizontal overflow: {width}px / {tab}',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            click_tab(page,'schedule')
            if width==1440:snap(page,'schedule-desktop')
        page.set_viewport_size({'width':390,'height':844});click_tab(page,'my')
        page.locator('#me-select').select_option('B. Anthony')
        check('Presider remains hidden for a member without a Presider duty',not page.locator('#tab-presider').is_visible())
        check('No uncaught JavaScript errors',not REPORT['console_errors'])
        ctx.close()
        # Escape also counts as declining; saved design takes effect before the offer.
        ctx=make_context(browser,unlocked=True);page=ctx.new_page();go(page);page.wait_for_selector('#nc-choice[open]');page.keyboard.press('Escape');page=again(page);page.wait_for_timeout(1000)
        check('Escape dismisses the offer without repeated prompts',page.locator('dialog[open]').count()==0)
        ctx.close();browser.close()
except Exception as error:
    REPORT['failed'].append(str(error));traceback.print_exc()
finally:
    server.shutdown()
    (OUT/'results.json').write_text(json.dumps(REPORT,indent=2))
    print(json.dumps({'passed':len(REPORT['passed']),'failed':REPORT['failed'],'console_errors':REPORT['console_errors']},indent=2))
if REPORT['failed']:raise SystemExit(1)
