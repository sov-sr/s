document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const savedKey = localStorage.getItem('asaf_gemini_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
});

document.getElementById('dilekceForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const apiKey = document.getElementById('apiKey').value.trim();
    const fileInput = document.getElementById('fileInput').files[0];
    const extraNotes = document.getElementById('extraNotes').value;

    const submitBtn = document.getElementById('submitBtn');
    const resultSection = document.getElementById('resultSection');
    const reportOutput = document.getElementById('reportOutput');

    if (!apiKey) {
        alert('Lütfen geçerli bir API anahtarı girin.');
        return;
    }

    if (!fileInput) {
        alert('Lütfen bir belge veya görsel yükleyin.');
        return;
    }

    // حفظ المفتاح في المتصفح لاستخدامه مستقبلاً
    localStorage.setItem('asaf_gemini_key', apiKey);

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor... Lütfen Bekleyin...';

    try {
        const base64Data = await convertFileToBase64(fileInput);
        const mimeType = fileInput.type || 'image/jpeg';

        const promptText = `Sen uzman bir Türk hukuk avukatısın. Sana sunulan bu belgeyi/görseli dikkatlice analiz et.
Ek olarak kullanıcının belirttiği şu notları da dikkate al: "${extraNotes}"

GÖREVİN:
Yüklenen belgedeki tüm detayları (Mahkeme adı, dosya numarası, taraflar, olaylar, kararlar veya iddialar) analiz ederek Türk Mahkemelerine sunulmaya uygun tam, eksiksiz ve resmi bir DİLEKÇE taslağı hazırla.

Dilekçe şu formatta olmalıdır:
1. MAHKEME BAŞLIĞI
2. DOSYA NO / ESAS NO (Varsa)
3. DAVACI / DAVALI VEYA TALEP EDEN BİLGİLERİ
4. KONU
5. AÇIKLAMALAR (Belgeden çıkarılan kronolojik olaylar ve hukuki değerlendirme)
6. HUKUKİ NEDENLER VE DELİLLER
7. SONUÇ VE İSTEM`;

        // إعداد مجسم الطلب
        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data.split(',')[1]
                        }
                    }
                ]
            }]
        };

        // تجربة النماذج الرسمية النشطة بالترتيب
        const models = ['gemini-1.5-flash', 'gemini-1.5-pro'];
        let success = false;
        let errorDetail = '';

        for (const model of models) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                if (response.ok && data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text) {
                    reportOutput.textContent = data.candidates[0].content.parts[0].text;
                    resultSection.classList.remove('hidden');
                    resultSection.scrollIntoView({ behavior: 'smooth' });
                    success = true;
                    break;
                } else if (data.error) {
                    errorDetail = data.error.message;
                }
            } catch (err) {
                console.error(`Error trying ${model}:`, err);
            }
        }

        if (!success) {
            alert('Hata Oluştu: ' + (errorDetail || 'Belge okunamadı. Lütfen görsel (JPG/PNG) olarak yüklemeyi deneyin veya API anahtarınızı kontrol edin.'));
        }

    } catch (error) {
        console.error('General Error:', error);
        alert('İşlem sırasında bir hata oluştu. Lütfen dosyanızın boyutunu kontrol edin.');
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
