const listEndpoint = '/pdf-files';
const pdfBaseUrl = '/pdf';
const ocrBaseUrl = '/ocr';
const indicatorsBaseUrl = '/indicators';
let pdfFiles = [];
let currentIndex = 0;
let loadedPdfFile = null;
let currentLeftView = 'pdf';

const piOrder = [
    "Diagnosis", 
    "Degree of Differentiation", 
    "Tumor Size", 
    "Tumor Depth",
    "Extent of Disease", 
    "Aggressive Growth Pattern", 
    "Perineural Invasion",
    "Lymphatic or Vascular Invasion", 
    "Margins", 
    "Lymph Nodes", 
    "Distant Metastasis",
    "T", "N", "M", 
    "Treatment Effect"
];

const fileStatuses = {}; // Track file statuses
let indicatorsData = {}; // Stores current indicators with annotations

document.getElementById('toggleSidebarButton').addEventListener('click', toggleSidebar);

async function populateFileBrowser() {
    const fileList = document.getElementById('fileList');
    try {
        const response = await fetch(listEndpoint);
        pdfFiles = await response.json();
        if (Array.isArray(pdfFiles) && pdfFiles.length > 0) {
            pdfFiles.forEach((pdfFile, index) => {
                const listItem = document.createElement('li');
                listItem.textContent = pdfFile;

                // Apply styles based on file status
                if (index === 0) {
                    listItem.classList.add("current-file");
                    fileStatuses[pdfFile] = "viewed";
                } else if (fileStatuses[pdfFile] === "viewed") {
                    listItem.classList.add("viewed-file");
                } else {
                    listItem.classList.add("non-viewed-file");
                }

                listItem.onclick = () => navigateToFile(index);
                fileList.appendChild(listItem);
            });
            loadPDF(0); // Load the first file
            setDefaultView();
        } else {
            console.warn("No PDF files found.");
        }
    } catch (error) {
        console.error("Error fetching PDF files:", error);
    }
}

function updateFileClasses() {
    const fileItems = document.querySelectorAll('#fileList li');
    fileItems.forEach((item, index) => {
        item.classList.remove('current-file', 'viewed-file', 'non-viewed-file');
        if (index === currentIndex) {
            item.classList.add('current-file');
            fileStatuses[pdfFiles[index]] = "viewed";
        } else if (fileStatuses[pdfFiles[index]] === "viewed") {
            item.classList.add('viewed-file');
        } else {
            item.classList.add('non-viewed-file');
        }
    });
}

document.getElementById('toggleSidebarButton').addEventListener('click', toggleSidebar);

function toggleSidebar() {
    const fileBrowser = document.getElementById('fileBrowser');
    const mainContent = document.querySelector('.main-content');
    fileBrowser.classList.toggle('hidden');
    mainContent.classList.toggle('full-width');
}

document.getElementById('prevButton').addEventListener('click', showPreviousFile);
document.getElementById('nextButton').addEventListener('click', showNextFile);

async function showPreviousFile() {
    if (currentIndex > 0) {
        await autoSaveAnnotations(); // Auto-save before navigation
        currentIndex--;
        loadPDF(currentIndex);
        updateFileClasses();
    }
}

async function showNextFile() {
    if (currentIndex < pdfFiles.length - 1) {
        await autoSaveAnnotations(); // Auto-save before navigation
        currentIndex++;
        loadPDF(currentIndex);
        updateFileClasses();
    }
}

function setDefaultView() {
    document.getElementById('leftDropdown').value = 'pdf';
    document.getElementById('rightDropdown').value = 'pi';

    const pdfFile = pdfFiles[currentIndex];
    const pdfPath = `${pdfBaseUrl}/${pdfFile}`;
    const pdfIframe = document.getElementById('pdfIframe');

    if (loadedPdfFile !== pdfFile) {
        pdfIframe.src = pdfPath;
        loadedPdfFile = pdfFile;
    }
    pdfIframe.style.display = 'block';
    document.getElementById('ocrTextContainerLeft').style.display = 'none';
    currentLeftView = 'pdf';

    loadIndicators(pdfFile);
    document.getElementById('piTableContainer').style.display = 'block';
    document.getElementById('ocrTextContainerRight').style.display = 'none';
}

async function navigateToFile(index) {
    if (index !== currentIndex) {
        await autoSaveAnnotations(); // Auto-save before navigating to another file
        currentIndex = index;
        loadPDF(currentIndex);
        updateFileClasses();
    }
}

function loadPDF(index) {
    currentIndex = index;
    const pdfFile = pdfFiles[currentIndex];
    const pdfPath = `${pdfBaseUrl}/${pdfFile}`;
    const pdfIframe = document.getElementById('pdfIframe');
    const loadingSpinner = document.getElementById('loadingSpinner');

    loadingSpinner.style.display = 'block';

    if (loadedPdfFile !== pdfFile) {
        pdfIframe.src = pdfPath;
        loadedPdfFile = pdfFile;
    }
    pdfIframe.style.display = 'block';
    document.getElementById('ocrTextContainerLeft').style.display = 'none';
    document.getElementById('leftDropdown').value = 'pdf';
    currentLeftView = 'pdf';

    pdfIframe.onload = () => {
        loadingSpinner.style.display = 'none';
    };

    updateFileClasses();

    loadIndicators(pdfFile);
    document.getElementById('piTableContainer').style.display = 'block';
    document.getElementById('ocrTextContainerRight').style.display = 'none';
    document.getElementById('rightDropdown').value = 'pi';

    updateProgressIndicator();
    loadOCRText(pdfFile, 'ocrTextContainerLeft');
    loadOCRText(pdfFile, 'ocrTextContainerRight');
}

async function loadOCRText(pdfFileName, containerId) {
    const ocrFileName = pdfFileName.replace('.PDF', '_textract_v1.txt');
    const ocrPath = `${ocrBaseUrl}/${ocrFileName}`;
    try {
        const response = await fetch(ocrPath);
        if (!response.ok) throw new Error(`Failed to fetch OCR file: ${ocrFileName}`);
        const ocrText = await response.text();
        document.getElementById(containerId).textContent = ocrText;
    } catch (error) {
        console.error("Error loading OCR text:", error);
    }
}

async function loadIndicators(pdfFileName) {
    const jsonFileName = pdfFileName.replace('.PDF', '_PI.json');
    const jsonPath = `${indicatorsBaseUrl}/${jsonFileName}`;
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) throw new Error(`Failed to fetch Indicators JSON: ${jsonFileName}`);
        indicatorsData = await response.json();
        displayIndicatorsAsTable(indicatorsData);
    } catch (error) {
        console.error("Error loading indicators JSON:", error);
    }
}

async function displayIndicatorsAsTable(indicators) {
    const container = document.getElementById('piTableContainer');
    container.innerHTML = `
        <table id="piTable" class="display">
            <thead>
                <tr>
                    <th style="width: 20%;">Indicator</th>
                    <th style="width: 25%;">Original Value</th>
                    <th style="width: 55%;">Comments</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;

    const tbody = container.querySelector('tbody');

    piOrder.forEach(key => {
        const originalValue = indicators[key]?.value || indicators[key] || "NA";
        const comment = indicators[key]?.comment || "";
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${key}</td>
            <td>${originalValue}</td>
            <td contenteditable="true" class="comment-cell" data-indicator="${key}">${comment}</td>
        `;
        tbody.appendChild(row);
    });

    if ($.fn.DataTable.isDataTable('#piTable')) {
        $('#piTable').DataTable().clear().destroy();
    }

    if (tbody.children.length > 0) {
        $('#piTable').DataTable({
            pageLength: 15,
            lengthChange: false,
            paging: false,
            searching: true,
            info: true,
            ordering: false,
            dom: 'lrtip',
            language: {
                info: "Showing 1 to 15 of 15 entries",
                emptyTable: ""
            }
        });
    }

    container.querySelectorAll('.comment-cell').forEach(cell => {
        cell.addEventListener('blur', () => {
            const indicator = cell.getAttribute('data-indicator');
            const comment = cell.textContent;
            if (indicators[indicator]) {
                indicators[indicator].comment = comment;
            }
        });
    });
}

async function autoSaveAnnotations() {
    const pdfFile = pdfFiles[currentIndex];
    const jsonFileName = `${pdfFile.replace('.PDF', '_PI.json')}`;

    // Create a deep copy of indicatorsData to avoid modifying the original structure
    const formattedData = JSON.parse(JSON.stringify(indicatorsData));

    // Ensure each entry has a `comment` field
    piOrder.forEach(key => {
        if (typeof formattedData[key] === 'string') {
            // If the original structure was a string, convert it to an object with `value` and `comment`
            formattedData[key] = {
                value: formattedData[key],
                comment: indicatorsData[key]?.comment || ""
            };
        } else if (formattedData[key]?.value) {
            // If it's already an object, add `comment` if it doesn’t exist
            formattedData[key].comment = indicatorsData[key]?.comment || "";
        }
    });

    try {
        const response = await fetch('/save-edited-pi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ indicators: formattedData, filename: jsonFileName })
        });
        if (!response.ok) {
            console.error('Failed to save annotations');
        }
    } catch (error) {
        console.error("Error saving annotations:", error);
    }
}



populateFileBrowser();
