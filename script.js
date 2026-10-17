document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    // Migrate old key name to new normalized key name
    const OLD_KEY = 'asaf_gemini_key';
    const NEW_KEY = 'sov_sr_user_key';

    try {
        const old = localStorage.getItem(OLD_KEY);
        const curr = localStorage.getItem(NEW_KEY);
        if (!curr && old) {
            // migrate and remove old
            localStorage.setItem(NEW_KEY, old);
            localStorage.removeItem(OLD_KEY);
            if (apiKeyInput) apiKeyInput.value = old;
        } else if (curr && apiKeyInput) {
            apiKeyInput.value = curr;
        }
    } catch (err) {
        console.warn('localStorage access error:', err);
    }

    // Ensure result/error UI exists; if not, create them
    ensureUIElements();
});

document.getElementById('dilekceForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const fileElem = document.getElementById('fileInput');
    const fileInput = fileElem && fileElem.files ? fileElem.files[0] : null;
    const extraNotesElem = document.getElementById('extraNotes');
    const extraNotes = extraNotesElem ? extraNotesElem.value : '';

    const submitBtn = document.getElementById('submitBtn');
    const resultSection = document.getElementById('resultSection');
    const reportOutput = document.getElementById('reportOutput');
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');

    clearError();
    setStatus('');

    if (!fileInput) {
        showError('Lütfen bir belge veya görsel yükleyin.');
        return;
    }

    // Basic size limit: 10 MB
    const MAX_FILE_BYTES = 10 * 1024 * 1024;
    if (fileInput.size > MAX_FILE_BYTES) {
        showError('Dosya çok büyük. Lütfen 10MB veya daha küçük bir dosya yükleyin.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor... Lütfen Bekleyin...';

    try {
        const base64Data = await convertFileToBase64(fileInput);
        const base64Parts = base64Data.split(',');
        if (base64Parts.length < 2) throw new Error('Dosya base64 formatında okunamadı.');
        const base64Only = base64Parts[1].replace(/\s+/g, '');
        const mimeType = fileInput.type || 'image/jpeg';

        // Send to server-side proxy (no secret in browser)
        const resp = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extraNotes, base64Data: base64Only, mimeType })
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
            const message = (data && (data.error || data.message)) ? JSON.stringify(data) : `HTTP ${resp.status} ${resp.statusText}`;
            showError('Sunucu hatası: ' + message);
            return;
        }

        if (data) {
            if (data.extracted) {
                // Render as safe HTML (allowing simple formatting)
                reportOutput.innerHTML = sanitizeHTML(convertPlainToHtml(data.extracted));
                resultSection.classList.remove('hidden');
                resultSection.scrollIntoView({ behavior: 'smooth' });
            } else if (data.modelResponse) {
                reportOutput.textContent = JSON.stringify(data.modelResponse, null, 2);
                resultSection.classList.remove('hidden');
                resultSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                showError('Beklenmeyen sunucu yanıtı.');
            }
        } else {
            showError('Sunucudan geçerli bir JSON yanıtı alınamadı.');
        }

    } catch (err) {
        console.error('General Error:', err);
        showError('İşlem sırasında bir hata oluştu: ' + (err.message || String(err)));
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-gavel"></i> Belgeyi Analiz Et ve Dilekçe Yaz';
    }
});

function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// UI helpers
function ensureUIElements() {
    let errorSection = document.getElementById('errorSection');
    if (!errorSection) {
        errorSection = document.createElement('div');
        errorSection.id = 'errorSection';
        errorSection.style.display = 'none';
        errorSection.innerHTML = '<div id="errorMessage" style="color:#a94442;background:#f2dede;padding:12px;border-radius:6px;margin:10px 0"></div>';
        const form = document.getElementById('dilekceForm');
        if (form) form.parentNode.insertBefore(errorSection, form.nextSibling);
    }

    let resultSection = document.getElementById('resultSection');
    if (!resultSection) {
        resultSection = document.createElement('div');
        resultSection.id = 'resultSection';
        resultSection.className = 'hidden';
        resultSection.style.marginTop = '12px';
        resultSection.innerHTML = '<div id="reportOutput" style="white-space:pre-wrap;background:#f8f9fa;padding:12px;border-radius:6px;border:1px solid #ddd;min-height:120px"></div>';
        const form = document.getElementById('dilekceForm');
        if (form) form.parentNode.insertBefore(resultSection, form.nextSibling);
    }
}

function showError(msg) {
    let errorSection = document.getElementById('errorSection');
    let errorMessage = document.getElementById('errorMessage');
    if (!errorSection || !errorMessage) {
        ensureUIElements();
        errorSection = document.getElementById('errorSection');
        errorMessage = document.getElementById('errorMessage');
    }
    errorMessage.textContent = msg;
    errorSection.style.display = 'block';
}

function clearError() {
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) errorMessage.textContent = '';
    if (errorSection) errorSection.style.display = 'none';
}

function setStatus(_msg) {
    // placeholder if you want to show status in the UI
}

// Very small sanitizer: allow only a limited set of tags and attributes
function sanitizeHTML(dirty) {
    // Create a template element and parse
    const template = document.createElement('template');
    template.innerHTML = dirty;
    const allowedTags = ['P','BR','B','STRONG','I','EM','UL','OL','LI','TABLE','TR','TD','TH','THEAD','TBODY','H1','H2','H3','H4'];

    function clean(node) {
        const nodeName = node.nodeName.toUpperCase();
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (!allowedTags.includes(nodeName)) {
            // Replace disallowed element with its text content
            return node.textContent || '';
        }
        // Recreate element and sanitize children
        const el = document.createElement(nodeName);
        // Only allow simple children (no attributes)
        for (const child of Array.from(node.childNodes)) {
            const cleaned = clean(child);
            if (typeof cleaned === 'string') el.appendChild(document.createTextNode(cleaned));
            else if (cleaned instanceof Node) el.appendChild(cleaned);
        }
        return el;
    }

    const cleanedNodes = Array.from(template.content.childNodes).map(clean).filter(Boolean);
    const wrapper = document.createElement('div');
    cleanedNodes.forEach(n => wrapper.appendChild(n));
    return wrapper.innerHTML;
}

function convertPlainToHtml(plain) {
    // Convert plain text with line breaks into simple paragraphs
    const paragraphs = plain.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return paragraphs.map(p => '<p>' + escapeHtml(p).replace(/\n/g, '<br/>') + '</p>').join('');
}

function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}
