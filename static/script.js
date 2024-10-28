const listEndpoint = 'http://127.0.0.1:5000/pdf-files';
const pdfBaseUrl = 'http://127.0.0.1:5000/pdf';
const ocrBaseUrl = 'http://127.0.0.1:5000/ocr';
let pdfFiles = [];
let currentIndex = 0;
let textZoomLevel = 1;
let isHighlightMode = false;
let isEraseMode = false;
let isCommentMode = false;
let annotations = [];

// Toggle sidebar visibility
function toggleSidebar() {
    const fileBrowser = document.getElementById('fileBrowser');
    const mainContent = document.querySelector('.main-content');
    
    fileBrowser.classList.toggle('hidden');
    mainContent.classList.toggle('full-width');
}

document.getElementById('toggleSidebarButton').addEventListener('click', toggleSidebar);

// Populate the file browser with the list of PDFs
async function populateFileBrowser() {
    const fileList = document.getElementById('fileList');
    try {
        const response = await fetch(listEndpoint);
        pdfFiles = await response.json();

        if (Array.isArray(pdfFiles) && pdfFiles.length > 0) {
            pdfFiles.forEach((pdfFile, index) => {
                const listItem = document.createElement('li');
                listItem.textContent = pdfFile;
                listItem.onclick = () => loadPDF(index);
                fileList.appendChild(listItem);
            });
            loadPDF(0); // Load the first PDF by default
        } else {
            console.warn("No PDF files found.");
        }
    } catch (error) {
        console.error("Error fetching PDF files:", error);
    }
}

// Load PDF and update progress
function loadPDF(index) {
    currentIndex = index;
    const pdfFile = pdfFiles[currentIndex];
    const pdfPath = `${pdfBaseUrl}/${pdfFile}`;

    document.getElementById('pdfIframe').src = pdfPath;

    Array.from(document.getElementById('fileList').children).forEach((item, idx) => {
        item.style.fontWeight = idx === index ? 'bold' : 'normal';
    });

    loadOCRText(pdfFile);
    updateProgressIndicator();
}

// Update progress display
function updateProgressIndicator() {
    document.getElementById('progressIndicator').textContent = `${currentIndex + 1} / ${pdfFiles.length}`;
}

// Navigation Buttons
document.getElementById('nextButton').addEventListener('click', () => {
    if (currentIndex < pdfFiles.length - 1) {
        loadPDF(currentIndex + 1);
    }
});

document.getElementById('prevButton').addEventListener('click', () => {
    if (currentIndex > 0) {
        loadPDF(currentIndex - 1);
    }
});

// Load OCR text
async function loadOCRText(pdfFileName) {
    const ocrFileName = pdfFileName.replace('.PDF', '_textract_v1.txt');
    const ocrPath = `${ocrBaseUrl}/${ocrFileName}`;

    try {
        const response = await fetch(ocrPath);
        if (!response.ok) throw new Error(`Failed to fetch OCR file: ${ocrFileName}`);
        
        const ocrText = await response.text();
        document.getElementById('ocrTextContainer').textContent = ocrText;
        document.getElementById('confirmEditButton').dataset.ocrFileName = ocrFileName;
    } catch (error) {
        console.error("Error loading OCR text:", error);
        document.getElementById('ocrTextContainer').textContent = "OCR text not available.";
    }
}

// Zoom functionality
document.getElementById('zoomInTextButton').addEventListener('click', () => {
    textZoomLevel += 0.1;
    updateZoom();
});

document.getElementById('zoomOutTextButton').addEventListener('click', () => {
    textZoomLevel = Math.max(0.1, textZoomLevel - 0.1); // Prevent zooming out below 10%
    updateZoom();
});

document.getElementById('resetTextZoomButton').addEventListener('click', () => {
    textZoomLevel = 1;
    updateZoom();
});

function updateZoom() {
    document.getElementById('ocrTextContainer').style.transform = `scale(${textZoomLevel})`;
}

// Helper function to toggle modes
function setMode(highlight, erase, comment) {
    isHighlightMode = highlight;
    isEraseMode = erase;
    isCommentMode = comment;

    document.getElementById('highlightToggleButton').textContent = isHighlightMode ? "Highlighter On" : "Highlighter Off";
    document.getElementById('eraseToggleButton').textContent = isEraseMode ? "Eraser On" : "Eraser Off";
    document.getElementById('addCommentButton').textContent = isCommentMode ? "Add Comment On" : "Add Comment Off";
}

// Toggle highlight mode
document.getElementById('highlightToggleButton').addEventListener('click', () => {
    setMode(!isHighlightMode, false, false);
});

// Toggle erase mode
document.getElementById('eraseToggleButton').addEventListener('click', () => {
    setMode(false, !isEraseMode, false);
});

// Toggle comment mode
document.getElementById('addCommentButton').addEventListener('click', () => {
    setMode(false, false, !isCommentMode);
});

// Handle highlighting, erasing, and adding comments
document.getElementById('ocrTextContainer').addEventListener('mouseup', () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && isHighlightMode) {
        const range = selection.getRangeAt(0);

        // Preserve whitespace or newlines after selection if present
        let endOffset = range.endOffset;
        let startNode = range.startContainer;
        let endNode = range.endContainer;

        if (endNode.textContent[endOffset] === ' ' || endNode.textContent[endOffset] === '\n') {
            endOffset += 1;
        }

        const modifiedRange = document.createRange();
        modifiedRange.setStart(startNode, range.startOffset);
        modifiedRange.setEnd(endNode, endOffset);

        const span = document.createElement("span");
        span.style.backgroundColor = "yellow";
        span.classList.add("highlighted");
        span.textContent = modifiedRange.toString(); 
        span.onclick = () => {
            if (isCommentMode) editComment(span, span.textContent, modifiedRange.startOffset, modifiedRange.endOffset);
        };

        modifiedRange.deleteContents();
        modifiedRange.insertNode(span);
        
        annotations.push({ text: span.textContent, comment: "", start: modifiedRange.startOffset, end: modifiedRange.endOffset });

        selection.removeAllRanges();
    } else if (isEraseMode) {
        const parentNode = selection.anchorNode.parentNode;
        if (parentNode && parentNode.classList.contains('highlighted')) {
            const erasedText = parentNode.textContent;

            parentNode.style.backgroundColor = 'transparent';
            parentNode.classList.remove("highlighted");
            parentNode.title = '';

            annotations = annotations.filter(anno => anno.text !== erasedText);
        }
    }

    selection.removeAllRanges();
});

function editComment(span, text, start, end) {
    const annotation = annotations.find(anno => anno.text === text && anno.start === start && anno.end === end);
    const newComment = prompt("Add/Edit comment:", annotation.comment);

    if (newComment !== null) { // Allow empty comments
        annotation.comment = newComment;
        span.title = newComment; // Update tooltip with the comment
    }
}

document.getElementById('confirmEditButton').addEventListener('click', async () => {
    const ocrFileName = document.getElementById('confirmEditButton').dataset.ocrFileName;
    const editedFileName = ocrFileName.replace('.txt', '_edited.json');

    const filteredAnnotations = annotations.filter((anno, index, arr) => {
        return !arr.some(otherAnno =>
            otherAnno !== anno && 
            otherAnno.start <= anno.start && 
            otherAnno.end >= anno.end
        );
    });

    const data = { 
        annotations: filteredAnnotations
    };

    try {
        const response = await fetch('/save-edited-ocr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...data, filename: editedFileName }),
        });
        
        if (response.ok) {
            alert('Final annotations saved successfully to ./edited_OCR');
        } else {
            console.error('Failed to save annotations');
        }
    } catch (error) {
        console.error("Error saving annotations:", error);
    }
});

populateFileBrowser();
