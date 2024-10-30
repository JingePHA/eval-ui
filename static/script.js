const listEndpoint = '/pdf-files';
const pdfBaseUrl = '/pdf';
const ocrBaseUrl = '/ocr';
const indicatorsBaseUrl = '/indicators';
let pdfFiles = [];
let currentIndex = 0;
let annotations = []; // Stores only the latest annotation for each PI entry
let loadedPdfFile = null; // Track the currently loaded PDF file to avoid reloading
let currentLeftView = 'pdf'; // Track current view for the left container

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

                listItem.onclick = () => loadPDF(index);
                fileList.appendChild(listItem);
            });
            loadPDF(0); // Load the first file
            setDefaultView(); // Set default views for left and right containers
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

// Function to toggle the file browser visibility
document.getElementById('toggleSidebarButton').addEventListener('click', toggleSidebar);

function toggleSidebar() {
    const fileBrowser = document.getElementById('fileBrowser');
    const mainContent = document.querySelector('.main-content');
    fileBrowser.classList.toggle('hidden');
    mainContent.classList.toggle('full-width');
}

// Functions to navigate between files
document.getElementById('prevButton').addEventListener('click', showPreviousFile);
document.getElementById('nextButton').addEventListener('click', showNextFile);

function showPreviousFile() {
    if (currentIndex > 0) {
        currentIndex--;  // Move to the previous file
        loadPDF(currentIndex);
        updateFileClasses();  // Update file list classes
    }
}

function showNextFile() {
    if (currentIndex < pdfFiles.length - 1) {
        currentIndex++;  // Move to the next file
        loadPDF(currentIndex);
        updateFileClasses();  // Update file list classes
    }
}

// Set default view to display PDF on the left and PI extraction on the right
function setDefaultView() {
    document.getElementById('leftDropdown').value = 'pdf';
    document.getElementById('rightDropdown').value = 'pi';

    const pdfFile = pdfFiles[currentIndex];
    const pdfPath = `${pdfBaseUrl}/${pdfFile}`;
    const pdfIframe = document.getElementById('pdfIframe');

    // Load PDF report in the left container and set initial display if not already loaded
    if (loadedPdfFile !== pdfFile) {
        pdfIframe.src = pdfPath;
        loadedPdfFile = pdfFile; // Cache the currently loaded file to prevent reloads
    }
    pdfIframe.style.display = 'block';
    document.getElementById('ocrTextContainerLeft').style.display = 'none';
    currentLeftView = 'pdf';

    // Load PI extraction table in the right container and show it
    loadIndicators(pdfFile);
    document.getElementById('piTableContainer').style.display = 'block';
    document.getElementById('ocrTextContainerRight').style.display = 'none';
}

function loadPDF(index) {
    currentIndex = index;
    const pdfFile = pdfFiles[currentIndex];
    const pdfPath = `${pdfBaseUrl}/${pdfFile}`;
    const pdfIframe = document.getElementById('pdfIframe');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Show the loading spinner
    loadingSpinner.style.display = 'block';

    // Only set the src if a different file is selected
    if (loadedPdfFile !== pdfFile) {
        pdfIframe.src = pdfPath;
        loadedPdfFile = pdfFile; // Update loaded file to avoid reloading on dropdown change
    }
    pdfIframe.style.display = 'block';
    document.getElementById('ocrTextContainerLeft').style.display = 'none';
    document.getElementById('leftDropdown').value = 'pdf';
    currentLeftView = 'pdf';

    // Hide spinner once the PDF has loaded
    pdfIframe.onload = () => {
        loadingSpinner.style.display = 'none';
    };

    // Load PI extraction table in the right container as default view
    loadIndicators(pdfFile);
    document.getElementById('piTableContainer').style.display = 'block';
    document.getElementById('ocrTextContainerRight').style.display = 'none';
    document.getElementById('rightDropdown').value = 'pi';

    updateProgressIndicator();
    loadOCRText(pdfFile, 'ocrTextContainerLeft');
    loadOCRText(pdfFile, 'ocrTextContainerRight');
}

// Event listener for left dropdown to toggle views and prevent unnecessary reloads
document.getElementById('leftDropdown').addEventListener('change', function() {
    const selectedOption = this.value;
    const pdfFile = pdfFiles[currentIndex];
    const pdfIframe = document.getElementById('pdfIframe');
    
    if (selectedOption === 'pdf' && currentLeftView !== 'pdf') {
        if (loadedPdfFile !== pdfFile) {
            const pdfPath = `${pdfBaseUrl}/${pdfFile}`;
            pdfIframe.src = pdfPath;
            loadedPdfFile = pdfFile;
        }
        pdfIframe.style.display = 'block';
        document.getElementById('ocrTextContainerLeft').style.display = 'none';
        currentLeftView = 'pdf';
    } else if (selectedOption === 'ocr' && currentLeftView !== 'ocr') {
        pdfIframe.style.display = 'none';
        document.getElementById('ocrTextContainerLeft').style.display = 'block';
        currentLeftView = 'ocr';
    }
});

document.getElementById('rightDropdown').addEventListener('change', function() {
    const selectedOption = this.value;
    const pdfFile = pdfFiles[currentIndex];
    
    if (selectedOption === 'pi') {
        loadIndicators(pdfFile);
        document.getElementById('piTableContainer').style.display = 'block';
        document.getElementById('ocrTextContainerRight').style.display = 'none';
    } else if (selectedOption === 'ocr') {
        document.getElementById('piTableContainer').style.display = 'none';
        document.getElementById('ocrTextContainerRight').style.display = 'block';
    }
});

function updateProgressIndicator() {
    document.getElementById('progressIndicator').textContent = `${currentIndex + 1} / ${pdfFiles.length}`;
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
        const indicators = await response.json();
        displayIndicatorsAsTable(indicators);
    } catch (error) {
        console.error("Error loading indicators JSON:", error);
    }
}

function displayIndicatorsAsTable(indicators) {
    const container = document.getElementById('piTableContainer');
    container.innerHTML = `
        <table id="piTable" class="display">
            <thead>
                <tr>
                    <th style="width: 30%;">Indicator</th>
                    <th style="width: 30%;">Original Value</th>
                    <th style="width: 40%;">Comments</th> <!-- More width for Comments -->
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;

    // Initialize annotations array based on piOrder
    annotations = piOrder.map(key => ({
        indicator: key,
        original_value: indicators[key] || "NA",
        comment: ""
    }));

    const tbody = container.querySelector('tbody');
    
    // Populate table rows in the order defined by piOrder
    piOrder.forEach(key => {
        const originalValue = indicators[key] || "NA";
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${key}</td>
            <td>${originalValue}</td>
            <td contenteditable="true" class="comment-cell" data-indicator="${key}"></td>
        `;
        tbody.appendChild(row);
    });

    // Initialize DataTable without ordering and with custom settings
    $('#piTable').DataTable({
        pageLength: 15,            // Show 15 entries by default
        lengthChange: false,       // Remove entries-per-page dropdown
        paging: false,             // Disable pagination controls
        searching: true,           // Enable search bar
        info: true,                // Show "Showing 1 to 15 of 15 entries"
        ordering: false,           // Disable internal sorting to maintain order
        dom: 'lrtip',              // Customize layout to hide pagination controls
        language: {
            info: "Showing 1 to 15 of 15 entries" // Customize info text
        }
    });

    // Update annotations on cell blur (save comments)
    container.querySelectorAll('.comment-cell').forEach(cell => {
        cell.addEventListener('blur', () => {
            const indicator = cell.getAttribute('data-indicator');
            const comment = cell.textContent;
            const annotationIndex = annotations.findIndex(a => a.indicator === indicator);
            if (annotationIndex > -1) {
                annotations[annotationIndex].comment = comment;
            }
        });
    });
}

document.getElementById('confirmEditButton').addEventListener('click', async () => {
    const pdfFile = pdfFiles[currentIndex];
    const jsonFileName = `${pdfFile.replace('.PDF', '_PI_annotated.json')}`;

    const data = { annotations, filename: jsonFileName };

    try {
        const response = await fetch('/save-edited-pi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (response.ok) {
            alert('Annotations saved successfully to PI_annotated.');
        } else {
            console.error('Failed to save annotations');
        }
    } catch (error) {
        console.error("Error saving annotations:", error);
    }
});

// Initial population of file browser and setting of default view
populateFileBrowser();
