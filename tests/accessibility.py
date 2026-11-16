from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright
base = Path(__file__).resolve().parent.parent / 'src'
css=(base/'assets/css/app.css').read_text()
js=(base/'assets/js/features/accessibility.js').read_text()
fixture='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><title>Access test</title><style>'''+css+'''</style></head><body>
<button id="openQuickStart">Open student setup</button><button id="openMergerBtn">Open attach dialog</button><button id="openShortcutHelpBtn">Open shortcuts</button>
<div id="moreMenu" class="menu-panel open"><button id="themeToggleBtn" type="button" role="menuitem"><span class="theme-toggle-label">Light theme</span><small>Use the light workspace</small></button></div>
<div id="studentQuickStart" role="dialog" aria-modal="true" aria-labelledby="qsTitle"><div class="qs-card"><h2 id="qsTitle">Student setup</h2><input id="qsName" aria-label="Student name"><button id="qsClose">Close setup</button><button id="qsSave">Save</button></div></div>
<div class="modal-overlay" id="mergerModal"><div class="modal-card"><h3>Attach your assignment</h3><input id="pdfInput" aria-label="PDF file"><button id="closeMergerModal">Close</button><button id="cancelMergerBtn">Cancel</button></div></div>
<div class="shortcut-overlay" id="shortcutHelp" hidden><div class="shortcut-card shortcut-help-card" role="dialog" aria-modal="true" aria-labelledby="shortcutHelpTitle"><h2 id="shortcutHelpTitle">Keyboard shortcuts</h2><button id="shortcutHelpDone">Done</button></div></div>
<script>window.__testStorage={}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return Object.prototype.hasOwnProperty.call(window.__testStorage,k)?window.__testStorage[k]:null},setItem(k,v){window.__testStorage[k]=String(v)}}});
document.getElementById('openQuickStart').addEventListener('click',()=>{document.getElementById('studentQuickStart').classList.add('open');setTimeout(()=>document.getElementById('qsName').focus(),20)});
document.getElementById('qsClose').addEventListener('click',()=>document.getElementById('studentQuickStart').classList.remove('open'));
document.getElementById('openMergerBtn').addEventListener('click',()=>document.getElementById('mergerModal').style.display='flex');
for(const id of ['closeMergerModal','cancelMergerBtn'])document.getElementById(id).addEventListener('click',()=>document.getElementById('mergerModal').style.display='none');
document.getElementById('openShortcutHelpBtn').addEventListener('click',()=>document.getElementById('shortcutHelp').hidden=false);
</script><script>'''+js+'''</script></body></html>'''
results=[]
with sync_playwright() as p:
    launch_options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
    chromium_path = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
    if chromium_path:
        launch_options['executable_path'] = chromium_path
    browser = p.chromium.launch(**launch_options)
    context=browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(fixture, wait_until='domcontentloaded')
    page.wait_for_timeout(80)
    page.keyboard.press('Tab')
    focus_outline = page.evaluate("({id:document.activeElement.id,width:getComputedStyle(document.activeElement).outlineWidth,style:getComputedStyle(document.activeElement).outlineStyle})")
    results.append(('visible keyboard focus', focus_outline['id'] == 'openQuickStart' and focus_outline['width'] == '2px' and focus_outline['style'] == 'solid'))

    page.locator('#themeToggleBtn').click()
    state=page.evaluate("({theme:document.documentElement.dataset.theme,label:document.querySelector('.theme-toggle-label').textContent,hint:document.querySelector('#themeToggleBtn small').textContent,stored:localStorage.getItem('coverdraft_theme_v1')})")
    results.append(('light theme applies and persists',state=={'theme':'light','label':'Dark theme','hint':'Use the dark workspace','stored':'light'}))
    page.locator('#themeToggleBtn').click()
    results.append(('dark theme toggle restores palette and label',page.evaluate("document.documentElement.dataset.theme")=='dark' and page.locator('.theme-toggle-label').inner_text()=='Light theme'))

    page.locator('#openQuickStart').click()
    page.wait_for_timeout(100)
    focus_inside=page.evaluate("document.getElementById('studentQuickStart').contains(document.activeElement)")
    focusables=page.evaluate("""(() => {const d=document.getElementById('studentQuickStart');return [...d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=\"hidden\"]) ,select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"]) ,[contenteditable=\"true\"]')].filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden').map(e=>e.id)})()""")
    page.locator('#'+focusables[-1]).focus()
    page.keyboard.press('Tab')
    tab_wrap=page.evaluate("document.getElementById('studentQuickStart').contains(document.activeElement)")
    page.keyboard.press('Escape')
    page.wait_for_timeout(80)
    close_restore=(not page.locator('#studentQuickStart').evaluate("el=>el.classList.contains('open')") and page.evaluate("document.activeElement.id")=='openQuickStart')
    results.append(('dialog traps Tab focus',focus_inside and tab_wrap and len(focusables)>0))
    results.append(('Escape closes dialog and restores opener',close_restore))

    page.locator('#openMergerBtn').click()
    page.wait_for_timeout(80)
    focus_modal=page.locator('#mergerModal').evaluate("el=>el.contains(document.activeElement)")
    mf=page.evaluate("""(() => [...document.querySelectorAll('#mergerModal button:not([disabled]),#mergerModal input:not([disabled])')].filter(e=>e.getClientRects().length).map(e=>e.id))()""")
    page.locator('#'+mf[0]).focus();page.keyboard.press('Shift+Tab')
    shift_wrap=page.locator('#mergerModal').evaluate("el=>el.contains(document.activeElement)")
    page.keyboard.press('Escape');page.wait_for_timeout(60)
    merger_restore=(page.locator('#mergerModal').evaluate("el=>getComputedStyle(el).display==='none'") and page.evaluate("document.activeElement.id")=='openMergerBtn')
    results.append(('modal traps reverse Tab',focus_modal and shift_wrap))
    results.append(('Escape closes modal and restores focus',merger_restore))

    page.locator('#openMergerBtn').click();page.wait_for_timeout(60)
    page.locator('#mergerModal').click(position={'x':2,'y':2});page.wait_for_timeout(60)
    results.append(('backdrop closes modal and restores focus',page.locator('#mergerModal').evaluate("el=>getComputedStyle(el).display==='none'") and page.evaluate("document.activeElement.id")=='openMergerBtn'))
    aria_name = page.locator('#mergerModal').get_attribute('aria-labelledby')
    results.append(('dialog exposes an accessible name', bool(aria_name) and page.locator('#'+aria_name).count() == 1 and page.locator('#mergerModal').get_attribute('aria-modal') == 'true'))

    # The shortcut help dialog uses the same focus-restoration system.
    page.locator('#openShortcutHelpBtn').click(); page.wait_for_timeout(60)
    help_focus = page.locator('#shortcutHelp').evaluate("el=>el.contains(document.activeElement)")
    page.keyboard.press('Escape'); page.wait_for_timeout(60)
    results.append(('shortcut dialog Escape/focus restoration', help_focus and page.locator('#shortcutHelp').evaluate("el=>el.hidden") and page.evaluate("document.activeElement.id") == 'openShortcutHelpBtn'))

    duration=page.locator('#studentQuickStart').evaluate("el=>getComputedStyle(el).transitionDuration")
    results.append(('reduced motion disables normal transitions',duration in ['1e-05s','0s','0.00001s']))
    light_style=page.evaluate("""(() => {document.documentElement.dataset.theme='light';const a=getComputedStyle(document.querySelector('.modal-card'));const b=getComputedStyle(document.querySelector('.btn-cyan')||document.body);return {bg:a.backgroundColor,body:getComputedStyle(document.body).color}})()""")
    results.append(('light theme computed styles',bool(light_style['bg']) and bool(light_style['body'])))
    mobile = browser.new_context(viewport={'width':360,'height':780}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    mobile_page = mobile.new_page()
    mobile_page.set_content(fixture, wait_until='domcontentloaded')
    mobile_height = mobile_page.locator('#themeToggleBtn').evaluate("el=>getComputedStyle(el).minHeight")
    mobile_qs_height = mobile_page.locator('#openQuickStart').evaluate("el=>getComputedStyle(el).minHeight")
    results.append(('touch target sizing', mobile_height == '44px' and mobile_qs_height == '44px'))
    mobile.close()
    browser.close()
for name,ok in results: print(('PASS' if ok else 'FAIL'),name)
if errors:
    print('BROWSER ERRORS:')
    for e in errors[:10]:print('-',e)
print(f'{sum(ok for _,ok in results)}/{len(results)} browser fixture checks passed')
if not all(ok for _,ok in results) or errors: raise SystemExit(1)
