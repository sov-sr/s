document.getElementById('dilekceForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const apiKey = document.getElementById('apiKey').value.trim();
    const fileInput = document.getElementById('fileInput').files[0];
    const extraNotes = document.getElementById('extraNotes').value;

    const submitBtn = document.getElementById('submitBtn');
    const resultSection = document.getElementById('resultSection');
    const reportOutput = document.getElementById('reportOutput');

    if (!fileInput) {
        alert('Lütfen bir belge veya görsel yükleyin.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Belge Analiz Ediliyor ve Dilekçe Yazılıyor...';

    try {
        // تحويل الملف إلى Base64
        const base64Data = await convertFileToBase64(fileInput);
        const mimeType = fileInput.type;

        const prompt = `Sen uzman bir Türk hukuk avukatısın. Sana sunulan bu belgeyi/görseli dikkatlice analiz et.
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

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data.split(',')[1]
                            }
                        }
                    ]
                }]
            })
        });

        const data = await response.json();

        if (response.ok && data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text) {
            reportOutput.textContent = data.candidates[0].content.parts[0].text;
            resultSection.classList.remove('hidden');
            resultSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            console.error('API Error:', data);
            const err = data.error ? data.error.message : 'Bilinmeyen bir hata oluştu.';
            alert('Hata oluşتا: ' + err);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('İşlem sırasında bir hata oluştu. Lütfen dosya boyutunu ve API anahtarınızı kontrol edin.');
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
