// কনফিগারেশন - Google Sheets API এবং Sheet IDs
const CONFIG = {
    API_KEY: 'AIzaSyCiEgyS_hZLOPYfntM2b5imvAx9iIWBSHY',
    SHEET_IDS: [
        '1ia2pkU2Zx0IKF4XI4Os_pVZfdlFqb815IwkDmc9IBpc',
        '1clRNb9t9_w0ZaqOtRq6uGBV2_NVVG1GpwzShYLBaAho',
        '110mm_LHmzRXTJoBiNfG0oym1JzQv6W3BMDdfSs3loTw',
        '1l8bauZWJn3a1vOqI_LG1rFscaRsGVASSjDzpb7AJsiE',
        '1UsbkB0pvCtX378db8N0q-weHncWKvSN5vhj0mUJpFnU',
        '1jA7HEgX6I0Tw-yYmsMyDa6LtjNo2W23nz7a3GJpf7VM',
        '13ZFdfDjOlw4R4_qu0NhIuYwSw1Bp29eq6-dGtlySVhg'
    ],
    SHEET_NAME: 'Sheet1',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    PRELOAD_ENABLED: true,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

// DOM Elements - HTML এলিমেন্ট গুলো
const admitNumberInput = document.getElementById('admitNumber');
const loadingSection = document.getElementById('loadingSection');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const resultCard = document.getElementById('resultCard');
const systemNote = document.getElementById('systemNote');
const searchSection = document.getElementById('searchSection');
const qrModal = document.getElementById('qrModal');
const loadingText = document.getElementById('loadingText');

// Performance and Cache Management
class PerformanceManager {
    constructor() {
        this.cache = new Map();
        this.cacheTimestamps = new Map();
        this.preloadPromises = new Map();
        this.isPreloading = false;
        this.preloadProgress = 0;
        this.rollNumberIndex = new Map(); // Fast lookup index
    }

    // Initialize cache and start preloading
    async initialize() {
        if (CONFIG.PRELOAD_ENABLED) {
            await this.preloadAllSheets();
        }
    }

    // Preload all sheets in parallel
    async preloadAllSheets() {
        this.isPreloading = true;
        const startTime = performance.now();
        
        try {
            // Create all fetch promises simultaneously
            const fetchPromises = CONFIG.SHEET_IDS.map((sheetId, index) => 
                this.fetchSheetWithRetry(sheetId, index)
            );

            // Wait for all sheets to load in parallel
            const results = await Promise.allSettled(fetchPromises);
            
            // Process results
            let successCount = 0;
            let totalRecords = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    successCount++;
                    totalRecords += result.value.length;
                    console.log(`Sheet ${index + 1} loaded: ${result.value.length} records`);
                } else {
                    console.warn(`Sheet ${index + 1} failed to load:`, result.reason);
                }
            });

            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`Preload completed: ${successCount}/${CONFIG.SHEET_IDS.length} sheets, ${totalRecords} total records in ${loadTime}s`);
            
        } catch (error) {
            console.error('Preload failed:', error);
        } finally {
            this.isPreloading = false;
        }
    }

    // Fetch sheet data with retry mechanism
    async fetchSheetWithRetry(sheetId, sheetIndex, retryCount = 0) {
        const cacheKey = `sheet_${sheetId}`;
        
        try {
            // Check cache first
            if (this.isCacheValid(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${CONFIG.SHEET_NAME}!A:L?key=${CONFIG.API_KEY}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.values || data.values.length < 2) {
                console.warn(`Sheet ${sheetIndex + 1} has no data`);
                return null;
            }

            // Process and cache the data
            const processedData = this.processSheetData(data.values, sheetIndex + 1);
            this.cacheData(cacheKey, processedData);
            
            return processedData;

        } catch (error) {
            console.error(`Error fetching sheet ${sheetIndex + 1} (attempt ${retryCount + 1}):`, error);
            
            if (retryCount < CONFIG.MAX_RETRIES) {
                await this.delay(CONFIG.RETRY_DELAY * (retryCount + 1));
                return this.fetchSheetWithRetry(sheetId, sheetIndex, retryCount + 1);
            }
            
            throw error;
        }
    }

    // Process sheet data and create index
    processSheetData(values, sheetNumber) {
        const headers = values[0];
        const rows = values.slice(1);
        const processedRows = [];

        rows.forEach(row => {
            if (row[0]) { // Has roll number
                const studentData = {
                    rollNumber: row[0].toString().trim(),
                    studentName: row[1] || 'N/A',
                    fatherName: row[2] || 'N/A',
                    motherName: row[3] || 'N/A',
                    board: row[4] || 'N/A',
                    group: row[5] || 'N/A',
                    result: row[6] || 'N/A',
                    institution: row[7] || 'N/A',
                    session: row[8] || 'N/A',
                    dob: row[9] || 'N/A',
                    gender: row[10] || 'N/A',
                    studentPhoto: this.processPhotoUrl(row[11]),
                    sheetNumber: sheetNumber
                };

                processedRows.push(studentData);
                
                // Create index for fast lookup
                const rollKey = studentData.rollNumber.toLowerCase();
                this.rollNumberIndex.set(rollKey, studentData);
            }
        });

        return processedRows;
    }

    // Process photo URLs for different formats
    processPhotoUrl(photoUrl) {
        if (!photoUrl) return '';

        // Google Drive link processing
        if (photoUrl.includes('drive.google.com')) {
            let fileIdMatch = photoUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!fileIdMatch) {
                fileIdMatch = photoUrl.match(/id=([a-zA-Z0-9-_]+)/);
            }
            if (fileIdMatch) {
                return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
            }
        }
        // Google Photos link processing
        else if (photoUrl.includes('photos.google.com')) {
            if (!photoUrl.includes('=w')) {
                return photoUrl + '=w500-h600-no';
            }
        }
        // Imgur link processing
        else if (photoUrl.includes('imgur.com') && !photoUrl.includes('.jpg') && !photoUrl.includes('.png')) {
            return photoUrl + '.jpg';
        }

        return photoUrl;
    }

    // Fast search in cached data
    searchInCache(rollNumber) {
        const rollKey = rollNumber.toLowerCase();
        return this.rollNumberIndex.get(rollKey);
    }

    // Cache management methods
    cacheData(key, data) {
        this.cache.set(key, data);
        this.cacheTimestamps.set(key, Date.now());
    }

    isCacheValid(key) {
        if (!this.cache.has(key)) return false;
        
        const timestamp = this.cacheTimestamps.get(key);
        return (Date.now() - timestamp) < CONFIG.CACHE_DURATION;
    }

    clearExpiredCache() {
        const now = Date.now();
        for (const [key, timestamp] of this.cacheTimestamps.entries()) {
            if (now - timestamp > CONFIG.CACHE_DURATION) {
                this.cache.delete(key);
                this.cacheTimestamps.delete(key);
            }
        }
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showPerformanceStatus(message) {
        if (performanceStatus) {
            document.getElementById('statusText').textContent = message;
            performanceStatus.style.display = 'block';
        }
    }

    hidePerformanceStatus() {
        if (performanceStatus) {
            performanceStatus.style.display = 'none';
        }
    }

    updateCacheStatus(message) {
        if (cacheStatus) {
            const cacheText = document.getElementById('cacheText');
            if (cacheText) {
                cacheText.textContent = 'ক্যাশ স্ট্যাটাস: ' + message;
            }
        }
    }
}

// Global variables
let currentResult = null;
let isQRSearch = false;
let performanceManager = new PerformanceManager();

// Event Listeners - ইভেন্ট লিসেনার সেটআপ
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize performance manager
    await performanceManager.initialize();
    
    // URL থেকে প্যারামিটার চেক করা
    checkURLParameters();
    
    // Enter key সাপোর্ট search input এর জন্য
    admitNumberInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchResult();
        }
    });
    
    // Input validation - শুধুমাত্র alphanumeric অক্ষর গ্রহণ করা
    admitNumberInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
    });

    // Periodic cache cleanup
    setInterval(() => {
        performanceManager.clearExpiredCache();
    }, 60000); // Every minute
});

// URL প্যারামিটার চেক করার ফাংশন
function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const rollNumber = urlParams.get('roll');
    
    if (rollNumber) {
        isQRSearch = true;
        admitNumberInput.value = rollNumber;
        
        // Hide search section for QR visitors
        if (searchSection) {
            searchSection.style.display = 'none';
        }
        
        // Auto search with slight delay
        setTimeout(() => {
            searchResult();
        }, 500);
    }
}

// Optimized search function
async function searchResult() {
    const admitNumber = admitNumberInput.value.trim();
    
    // Validation
    if (!admitNumber) {
        showError('দয়া করে একটি রোল নাম্বার লিখুন।');
        return;
    }
    
    if (admitNumber.length < 3) {
        showError('রোল নাম্বার কমপক্ষে ৩ অক্ষরের হতে হবে।');
        return;
    }
    
    // QR notice removal - no longer needed
    
    // Show loading
    showLoading();
    
    try {
        const startTime = performance.now();
        
        // Try cache first
        let result = performanceManager.searchInCache(admitNumber);
        
        if (result) {
            const searchTime = ((performance.now() - startTime)).toFixed(0);
            console.log(`Found in cache in ${searchTime}ms`);
            updateLoadingText(`লোড হচ্ছে...`);
            
            setTimeout(() => {
                showResult(result);
                clearUrlParameters();
            }, 500);
            
            return;
        }
        
        // If not in cache, fetch from API  
        updateLoadingText('লোড হচ্ছে...');
        result = await fetchStudentDataLive(admitNumber);
        
        if (result) {
            const searchTime = ((performance.now() - startTime)).toFixed(0);
            console.log(`Found via API in ${searchTime}ms`);
            showResult(result);
            clearUrlParameters();
        } else {
            showError();
        }
        
    } catch (error) {
        console.error('Error searching result:', error);
        showError('ডেটা লোড করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
    }
}

// Live search when cache miss occurs
async function fetchStudentDataLive(admitNumber) {
    const fetchPromises = CONFIG.SHEET_IDS.map((sheetId, index) => 
        performanceManager.fetchSheetWithRetry(sheetId, index)
    );

    try {
        const results = await Promise.allSettled(fetchPromises);
        
        // Search through all loaded sheets
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                const found = result.value.find(student => 
                    student.rollNumber.toLowerCase() === admitNumber.toLowerCase()
                );
                if (found) {
                    return found;
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Live search failed:', error);
        throw error;
    }
}

// Clear URL parameters after successful search
function clearUrlParameters() {
    if (isQRSearch) {
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        isQRSearch = false;
    }
}

// UI Update Functions
function updateLoadingText(text) {
    if (loadingText) {
        loadingText.textContent = text;
    }
}

function showLoading() {
    hideAllSections();
    loadingSection.style.display = 'block';
    loadingSection.classList.add('fade-in');
    updateLoadingText('লোড হচ্ছে...');
}

function showResult(result) {
    currentResult = result;
    hideAllSections();
    
    // Student photo HTML with improved loading
    const studentPhotoHTML = result.studentPhoto ? 
        `<div class="student-photo">
            <img src="${result.studentPhoto}" 
                 alt="Student Photo" 
                 id="studentPhotoImg"
                 onerror="handleImageError(this)"
                 onload="handleImageLoad(this)">
            <div class="photo-loading" id="photoLoading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>ছবি লোড হচ্ছে...</span>
            </div>
            <div class="photo-error" id="photoError" style="display: none;">
                <i class="fas fa-user"></i>
                <span>ছবি উপলব্ধ নেই</span>
            </div>
        </div>` : 
        `<div class="student-photo">
            <div class="photo-placeholder">
                <i class="fas fa-user"></i>
                <span>ছবি উপলব্ধ নেই</span>
            </div>
        </div>`;
    
    // রেজাল্ট HTML তৈরি করা - উন্নত টেবিল ফরম্যাট ইমেজ সহ
    const resultHTML = `
        <div class="result-header-info">
            <div class="result-title">
                <h3> SCIENCE & INFORMATION TECHNOLOGY-FOUNDATION</h3>
                <p>WEB BASED RESULT PUBLICATION SYSTEM</p>
                <p>PARAMEDICAL/DMA/LMAF/VETERINARY AND EQUIVALENT EXAMINATION</p>
            </div>
        </div>
        <div class="result-content-wrapper">
            ${studentPhotoHTML}
            <div class="result-table">
                <table class="result-data-table">
                    <tr>
                        <td class="label">Roll No</td>
                        <td class="value">${result.rollNumber}</td>
                    </tr>
                    <tr>
                        <td class="label">Name of Student</td>
                        <td class="value">${result.studentName}</td>
                    </tr>
                    <tr>
                        <td class="label">Father's Name</td>
                        <td class="value">${result.fatherName}</td>
                    </tr>
                    <tr>
                        <td class="label">Mother's Name</td>
                        <td class="value">${result.motherName}</td>
                    </tr>
                    <tr>
                        <td class="label">Gender</td>
                        <td class="value">${result.gender}</td>
                    </tr>
                    <tr>
                        <td class="label">Date of Birth</td>
                        <td class="value">${result.dob}</td>
                    </tr>
                    <tr>
                        <td class="label">Board</td>
                        <td class="value">${result.board}</td>
                    </tr>
                    <tr>
                        <td class="label">Course</td>
                        <td class="value">${result.group}</td>
                    </tr>
                    <tr>
                        <td class="label">Session</td>
                        <td class="value">${result.session}</td>
                    </tr>
                    <tr>
                        <td class="label">Institute</td>
                        <td class="value">${result.institution}</td>
                    </tr>
                    <tr>
                        <td class="label result-grade">Result</td>
                        <td class="value result-grade">${result.result}</td>
                    </tr>
                </table>
            </div>
        </div>
    `;
    
    resultCard.innerHTML = resultHTML;
    systemNote.innerHTML = generateSystemNote(result.rollNumber);
    
    resultSection.style.display = 'block';
    resultSection.classList.add('fade-in');
}

function showError(message = 'কোনো ফলাফল পাওয়া যায়নি। দয়া করে আপনার রোল নাম্বার পুনরায় চেক করুন।') {
    hideAllSections();
    document.getElementById('errorMessage').textContent = message;
    errorSection.style.display = 'block';
    errorSection.classList.add('fade-in');
}

function hideAllSections() {
    const sections = [loadingSection, resultSection, errorSection];
    sections.forEach(section => {
        if (section) {
            section.style.display = 'none';
            section.classList.remove('fade-in');
        }
    });
}

// Image handling functions
function handleImageLoad(img) {
    const photoLoading = document.getElementById('photoLoading');
    const photoError = document.getElementById('photoError');
    
    if (photoLoading) photoLoading.style.display = 'none';
    if (photoError) photoError.style.display = 'none';
    img.style.display = 'block';
    
    // Show beautiful success message
    showImageSuccessMessage();
}

function showImageSuccessMessage() {
    // Create success message element
    const successMsg = document.createElement('div');
    successMsg.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
            z-index: 1000;
            font-family: 'Noto Sans Bengali', sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideInRight 0.5s ease-out;
        ">
            <i class="fas fa-check-circle" style="color: #fff;"></i>
            <span>স্টুডেন্টের ছবি সফল ভাবে লোড হয়েছে</span>
        </div>
    `;
    
    // Add animation styles if not already present
    if (!document.getElementById('successAnimationStyles')) {
        const styles = document.createElement('style');
        styles.id = 'successAnimationStyles';
        styles.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes fadeOut {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(100%);
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(successMsg);
    
    // Remove after 4 seconds with fade out animation
    setTimeout(() => {
        const msgElement = successMsg.firstElementChild;
        msgElement.style.animation = 'fadeOut 0.5s ease-in forwards';
        setTimeout(() => {
            if (successMsg.parentNode) {
                successMsg.parentNode.removeChild(successMsg);
            }
        }, 500);
    }, 4000);
}

function handleImageError(img) {
    const photoLoading = document.getElementById('photoLoading');
    const photoError = document.getElementById('photoError');
    
    if (photoLoading) photoLoading.style.display = 'none';
    if (photoError) {
        photoError.style.display = 'flex';
        photoError.innerHTML = `
            <i class="fas fa-user"></i>
            <span>ছবি লোড করা যায়নি</span>
            <small>ছবিটি হয়তো সরানো হয়েছে বা লিংক ভুল</small>
        `;
    }
    img.style.display = 'none';
}

// System note generation
function generateSystemNote(rollNumber) {
    return `
        <div class="system-note-footer">
            <p><i class="fas fa-info-circle"></i> This is a system generated certificate no signature required</p>
        </div>
    `;
}

// QR Code functions
function generateQR() {
    if (!currentResult) return;
    
    const currentDomain = window.location.origin;
    const currentPath = window.location.pathname;
    const qrUrl = `${currentDomain}${currentPath}?roll=${encodeURIComponent(currentResult.rollNumber)}`;
    
    // Set URL in input
    document.getElementById('qrUrlInput').value = qrUrl;
    
    // Generate QR code using multiple libraries as fallback
    const qrContainer = document.getElementById('qrCodeImage');
    qrContainer.innerHTML = '';
    
    try {
        // Try QRCode.js first
        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(qrContainer, qrUrl, {
                width: 250,
                height: 250,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            }, function(error) {
                if (error) {
                    console.error('QRCode.js failed:', error);
                    generateQRFallback(qrContainer, qrUrl);
                }
            });
        } else {
            generateQRFallback(qrContainer, qrUrl);
        }
    } catch (error) {
        console.error('QR generation failed:', error);
        generateQRFallback(qrContainer, qrUrl);
    }
    
    // Show modal
    qrModal.style.display = 'flex';
}

function generateQRFallback(container, url) {
    try {
        // Try QRious as fallback
        if (typeof QRious !== 'undefined') {
            const canvas = document.createElement('canvas');
            const qr = new QRious({
                element: canvas,
                value: url,
                size: 250,
                foreground: '#000000',
                background: '#FFFFFF'
            });
            container.appendChild(canvas);
        } else if (typeof kjua !== 'undefined') {
            // Try kjua as second fallback
            const qrCanvas = kjua({
                text: url,
                size: 250,
                fill: '#000000',
                back: '#FFFFFF',
                rounded: 10,
                quiet: 1
            });
            container.appendChild(qrCanvas);
        } else {
            // Text fallback
            container.innerHTML = `
                <div class="qr-fallback">
                    <i class="fas fa-qrcode" style="font-size: 4rem; color: #ccc;"></i>
                    <p>QR কোড জেনারেট করা যায়নি</p>
                    <p>লিংকটি কপি করে ব্যবহার করুন</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('All QR fallbacks failed:', error);
        container.innerHTML = `
            <div class="qr-fallback">
                <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: #ff6b6b;"></i>
                <p>QR কোড তৈরি করতে সমস্যা</p>
            </div>
        `;
    }
}

function closeQRModal() {
    qrModal.style.display = 'none';
}

function copyQRUrl() {
    const urlInput = document.getElementById('qrUrlInput');
    urlInput.select();
    urlInput.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(urlInput.value).then(() => {
        showMessage('লিংক কপি হয়েছে!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        document.execCommand('copy');
        showMessage('লিংক কপি হয়েছে!', 'success');
    });
}

// Utility functions
function printResult() {
    if (!currentResult) return;
    
    // Create a temporary print window
    const printWindow = window.open('', '_blank');
    
    // Student photo HTML for print
    const studentPhotoHTML = currentResult.studentPhoto ? 
        `<div class="student-photo-print">
            <img src="${currentResult.studentPhoto}" alt="Student Photo" />
        </div>` : 
        `<div class="student-photo-print">
            <div class="photo-placeholder-print">Photo Not Available</div>
        </div>`;
    
    const printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>পরীক্ষার ফলাফল - ${currentResult.rollNumber}</title>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 20px; }
                .print-header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%) !important; color: white !important; padding: 20px; border-radius: 10px; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                .print-header h1 { color: white !important; margin-bottom: 10px; font-size: 1.5rem; }
                .print-header p { color: rgba(255,255,255,0.9) !important; margin: 5px 0; }
                .print-content { max-width: 800px; margin: 0 auto; }
                .result-content-wrapper { display: flex; gap: 30px; align-items: flex-start; margin-bottom: 30px; }
                .student-photo-print { width: 200px; height: 250px; border: 3px solid #ddd; border-radius: 10px; overflow: hidden; flex-shrink: 0; }
                .student-photo-print img { width: 100%; height: 100%; object-fit: cover; }
                .photo-placeholder-print { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f8f9fa !important; color: #666; font-weight: bold; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                .result-table-container { flex: 1; }
                .result-table { width: 100%; border-collapse: collapse; }
                .result-table td { padding: 12px; border: 1px solid #ddd; }
                .label { background: #f5f5f5 !important; font-weight: bold; width: 30%; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                .value { background: white !important; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                .system-note { margin-top: 30px; padding: 15px; background: #f8f9fa !important; border-radius: 8px; text-align: center; border-left: 5px solid #28a745 !important; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                .note-text { color: #495057; font-style: italic; }
                @media print {
                    * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                    body { margin: 0; }
                    .print-content { max-width: none; }
                    .print-header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%) !important; color: white !important; }
                    .print-header h1, .print-header p { color: white !important; }
                }
            </style>
        </head>
        <body>
            <div class="print-content">
                <div class="print-header">
                    <h1> SCIENCE & INFORMATION TECHNOLOGY-FOUNDATION</h1>
                    <p>WEB BASED RESULT PUBLICATION SYSTEM  </p>
                    <p>PARAMEDICAL/DMA/LMAF/VETERINARY AND EQUIVALENT EXAMINATION</p>
                </div>
                <div class="result-content-wrapper">
                    ${studentPhotoHTML}
                    <div class="result-table-container">
                        <table class="result-table">
                            <tr>
                                <td class="label">Roll No</td>
                                <td class="value">${currentResult.rollNumber}</td>
                            </tr>
                            <tr>
                                <td class="label">Name of Student</td>
                                <td class="value">${currentResult.studentName}</td>
                            </tr>
                            <tr>
                                <td class="label">Father's Name</td>
                                <td class="value">${currentResult.fatherName}</td>
                            </tr>
                            <tr>
                                <td class="label">Mother's Name</td>
                                <td class="value">${currentResult.motherName}</td>
                            </tr>
                            <tr>
                                <td class="label">Gender</td>
                                <td class="value">${currentResult.gender}</td>
                            </tr>
                            <tr>
                                <td class="label">Date of Birth</td>
                                <td class="value">${currentResult.dob}</td>
                            </tr>
                            <tr>
                                <td class="label">Board</td>
                                <td class="value">${currentResult.board}</td>
                            </tr>
                            <tr>
                                <td class="label">Course</td>
                                <td class="value">${currentResult.group}</td>
                            </tr>
                            <tr>
                                <td class="label">Session</td>
                                <td class="value">${currentResult.session}</td>
                            </tr>
                            <tr>
                                <td class="label">Institute</td>
                                <td class="value">${currentResult.institution}</td>
                            </tr>
                            <tr>
                                <td class="label">Result</td>
                                <td class="value"><strong>${currentResult.result}</strong></td>
                            </tr>
                        </table>
                    </div>
                </div>
                <div class="system-note">
                    <div class="note-text">This is a system generated certificate no signature required</div>
                </div>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                    window.onafterprint = function() {
                        window.close();
                    }
                }
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
}

function resetSearch() {
    admitNumberInput.value = '';
    currentResult = null;
    hideAllSections();
    
    // Show search section for QR visitors (who previously had it hidden)
    if (searchSection) {
        searchSection.style.display = 'block';
    }
    
    // Reset QR search flag
    isQRSearch = false;
    
    // Focus on input
    admitNumberInput.focus();
}

function showMessage(message, type = 'info') {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Click outside modal to close
window.addEventListener('click', function(event) {
    if (event.target === qrModal) {
        closeQRModal();
    }
});

// Add CSS animation keyframes dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    .fade-in {
        animation: fadeIn 0.5s ease-in-out;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);
