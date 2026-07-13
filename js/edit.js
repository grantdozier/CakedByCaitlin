/* ==========================================================================
   IN-PLACE EDITOR

   Caitlin clicks a photo on the real site, picks a new one, sees it swap in immediately,
   and hits "Save changes". About a minute later it's live.

   That's the whole feature. It exists because /admin (a CMS form with a preview pane) is a
   different thing from what she asked for: she wants to change the picture where the picture
   IS. There isn't much for her to change — so the little that there is has to feel effortless.

   HOW IT'S SAFE FOR VISITORS
   It does nothing at all unless BOTH are true:
     1. the URL carries ?edit=1, and
     2. the person signs in with GitHub and has write access to the repo.
   A stranger who guesses ?edit=1 gets a sign-in prompt and nothing else. Write access is
   enforced by GitHub, not by us — there is no client-side "is admin" flag to bypass.

   HOW IT SAVES
   One atomic commit via the Git Data API (blobs -> tree -> commit -> ref), not N commits via
   the Contents API. Two reasons that matters: five photo changes become ONE deploy instead of
   five, and a half-applied save is impossible.

   Photos are resized and converted to WebP in the browser before upload. A modern phone photo
   is 3-6 MB; on the page it's displayed at ~600px. Uploading the raw file would be slow on
   wedding-venue wifi and would bloat the repo forever.
   ========================================================================== */

(function () {
    'use strict';

    if (new URLSearchParams(location.search).get('edit') !== '1') return;

    var REPO   = 'grantdozier/CakedByCaitlin';
    var BRANCH = 'main';

    /* The same Cloudflare Worker that Sveltia CMS uses — one OAuth app, one worker, both
       sign-in paths. Set this once (see docs/LOGINS.md) and /admin and this both work. */
    var AUTH_BASE = window.CBC_AUTH_BASE || '';

    var MAX_EDGE = 1600;   // plenty for a 600px display box at 2x
    var QUALITY  = 0.86;

    var token = sessionStorage.getItem('cbc_token') || '';
    var pending = {};      // data-edit key -> { path, blob, previewUrl, label }
    var bar, status;

    /* ---------------------------------------------------------------- shell */

    function init() {
        document.body.classList.add('is-editing');
        buildBar();

        if (token) enableEditing();
        else setStatus('Sign in to edit', true);
    }

    function buildBar() {
        bar = document.createElement('div');
        bar.className = 'edit-bar';
        bar.innerHTML =
            '<span class="edit-status" id="editStatus"></span>' +
            '<div class="edit-actions">' +
            '  <button type="button" class="edit-btn edit-btn--ghost" id="editDiscard" hidden>Discard</button>' +
            '  <button type="button" class="edit-btn" id="editSave" hidden>Save changes</button>' +
            '  <button type="button" class="edit-btn" id="editSignIn">Sign in with GitHub</button>' +
            '</div>';
        document.body.appendChild(bar);

        status = bar.querySelector('#editStatus');
        bar.querySelector('#editSignIn').addEventListener('click', signIn);
        bar.querySelector('#editSave').addEventListener('click', save);
        bar.querySelector('#editDiscard').addEventListener('click', discard);
    }

    function setStatus(text, showSignIn) {
        status.textContent = text;
        bar.querySelector('#editSignIn').hidden = !showSignIn;
    }

    function refreshBar() {
        var n = Object.keys(pending).length;
        bar.querySelector('#editSave').hidden = n === 0;
        bar.querySelector('#editDiscard').hidden = n === 0;
        setStatus(
            n === 0 ? 'Tap any photo to change it' : n + (n === 1 ? ' change' : ' changes') + ' — not saved yet',
            false
        );
    }

    /* ----------------------------------------------------------------- auth */

    function signIn() {
        if (!AUTH_BASE) {
            setStatus('Editing is not set up yet — see docs/LOGINS.md', true);
            return;
        }

        // Popup, not a redirect: a redirect would lose any unsaved previews on the page.
        var w = window.open(
            AUTH_BASE + '/auth?provider=github&site_id=' + location.hostname + '&scope=repo',
            'cbc-auth',
            'width=600,height=720'
        );

        function onMessage(e) {
            if (typeof e.data !== 'string' || e.data.indexOf('authorization:github:success:') !== 0) return;

            try {
                var payload = JSON.parse(e.data.split('authorization:github:success:')[1]);
                token = payload.token;
                sessionStorage.setItem('cbc_token', token);
                window.removeEventListener('message', onMessage);
                if (w) w.close();
                enableEditing();
            } catch (err) {
                setStatus("Sign-in didn't work. Try again.", true);
            }
        }

        window.addEventListener('message', onMessage);
    }

    function gh(path, opts) {
        opts = opts || {};
        return fetch('https://api.github.com/repos/' + REPO + path, {
            method: opts.method || 'GET',
            headers: {
                Authorization: 'Bearer ' + token,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
            return r.json();
        });
    }

    /* -------------------------------------------------------------- editing */

    function enableEditing() {
        var targets = document.querySelectorAll('[data-edit]');

        targets.forEach(function (el) {
            el.classList.add('is-editable');

            var overlay = document.createElement('span');
            overlay.className = 'edit-badge';
            overlay.textContent = 'Change photo';

            var host = el.closest('button') || el.parentElement;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.appendChild(overlay);

            // Capture phase, and stop the event dead. Otherwise clicking the hero would ALSO
            // fire the black-and-white reveal, and clicking a product card would follow the
            // affiliate link straight off the page mid-edit.
            host.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                pick(el);
            }, true);
        });

        refreshBar();
    }

    function pick(el) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            if (file) process(el, file);
        });

        input.click();
    }

    /* Resize + WebP in the browser. A raw phone photo is 3-6 MB and gets displayed at ~600px:
       uploading it as-is would be slow on venue wifi and would live in the repo forever. */
    function process(el, file) {
        setStatus('Preparing photo…', false);

        var img = new Image();
        img.onload = function () {
            var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
            var w = Math.round(img.width * scale);
            var h = Math.round(img.height * scale);

            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);

            canvas.toBlob(function (blob) {
                if (!blob) { setStatus("That image didn't work. Try another.", false); return; }

                var key = el.dataset.edit;
                var url = URL.createObjectURL(blob);

                // THE LIVE PREVIEW. Swap it in on the page, in place, immediately.
                if (el.tagName === 'IMG') {
                    el.src = url;
                } else {
                    // A no-image product tile: replace the typographic placeholder with the photo.
                    var real = document.createElement('img');
                    real.src = url;
                    real.alt = el.dataset.editLabel || '';
                    real.className = '';
                    Object.keys(el.dataset).forEach(function (k) { real.dataset[k] = el.dataset[k]; });
                    real.classList.add('is-editable');
                    el.replaceWith(real);
                    el = real;
                }

                el.classList.add('is-changed');

                pending[key] = {
                    path: el.dataset.editPath,
                    label: el.dataset.editLabel,
                    blob: blob,
                    previewUrl: url,
                };

                refreshBar();
            }, 'image/webp', QUALITY);
        };

        img.onerror = function () { setStatus("That file isn't an image I can read.", false); };
        img.src = URL.createObjectURL(file);
    }

    function discard() {
        Object.keys(pending).forEach(function (k) { URL.revokeObjectURL(pending[k].previewUrl); });
        pending = {};
        location.reload();
    }

    /* ---------------------------------------------------------------- saving */

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload = function () { resolve(String(r.result).split(',')[1]); };
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    }

    async function save() {
        var keys = Object.keys(pending);
        if (!keys.length) return;

        var saveBtn = bar.querySelector('#editSave');
        saveBtn.disabled = true;

        try {
            setStatus('Saving…', false);

            /* ONE atomic commit via the Git Data API — not N commits via the Contents API.
               Five photo changes become one deploy instead of five, and a half-applied save
               is impossible. */
            var ref = await gh('/git/ref/heads/' + BRANCH);
            var baseCommit = await gh('/git/commits/' + ref.object.sha);

            var treeItems = [];

            for (var i = 0; i < keys.length; i++) {
                var change = pending[keys[i]];
                setStatus('Uploading ' + (i + 1) + ' of ' + keys.length + '…', false);

                var b64 = await blobToBase64(change.blob);
                var blobRes = await gh('/git/blobs', {
                    method: 'POST',
                    body: { content: b64, encoding: 'base64' },
                });

                treeItems.push({ path: change.path, mode: '100644', type: 'blob', sha: blobRes.sha });
            }

            /* If a product had NO image, its path is brand new — so products.json has to learn
               about it, or the build would keep rendering the typographic tile over a photo
               that now exists on disk. */
            var newProductImages = keys.filter(function (k) {
                return k.indexOf('product.') === 0 && !document.querySelector('[data-edit="' + k + '"]').dataset.editHadImage;
            });

            if (newProductImages.length) {
                var pf = await gh('/contents/data/products.json?ref=' + BRANCH);
                var pj = JSON.parse(decodeURIComponent(escape(atob(pf.content.replace(/\n/g, '')))));

                newProductImages.forEach(function (k) {
                    var id = k.split('.')[1];
                    var prod = pj.products.find(function (p) { return p.id === id; });
                    if (prod) prod.image = pending[k].path;
                });

                var pb = await gh('/git/blobs', {
                    method: 'POST',
                    body: { content: btoa(unescape(encodeURIComponent(JSON.stringify(pj, null, 2) + '\n'))), encoding: 'base64' },
                });
                treeItems.push({ path: 'data/products.json', mode: '100644', type: 'blob', sha: pb.sha });
            }

            setStatus('Publishing…', false);

            var tree = await gh('/git/trees', {
                method: 'POST',
                body: { base_tree: baseCommit.tree.sha, tree: treeItems },
            });

            var commit = await gh('/git/commits', {
                method: 'POST',
                body: {
                    message: 'Update ' + keys.length + ' photo' + (keys.length === 1 ? '' : 's') + ' (from the site editor)',
                    tree: tree.sha,
                    parents: [ref.object.sha],
                },
            });

            await gh('/git/refs/heads/' + BRANCH, {
                method: 'PATCH',
                body: { sha: commit.sha },
            });

            pending = {};
            bar.querySelector('#editSave').hidden = true;
            bar.querySelector('#editDiscard').hidden = true;
            setStatus('Saved. Your photos will be live in about a minute.', false);
            bar.classList.add('is-done');

        } catch (err) {
            /* Never pretend it worked. The old site displayed a fake "Sent!" on a booking form
               that silently threw every inquiry away — we are not repeating that here. */
            setStatus("Couldn't save: " + err.message, false);
            saveBtn.disabled = false;
        }
    }

    init();
}());
