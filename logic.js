// --- Global Variables & Constants ---
let cards = [];
const fileInput = document.getElementById("fileInput");
const fileError = document.getElementById("fileError");
const cardPreview = document.getElementById("cardPreview");
const cardCount = document.getElementById("cardCount");
const generatePdfBtn = document.getElementById("generatePdfBtnImport"); // Matched with HTML ID
const loadingIndicator = document.getElementById("loadingIndicator");
const progressIndicator = document.getElementById("progressIndicator");
const pdfError = document.getElementById("pdfError");
const deckTitleInput = document.getElementById("templateDeckTitle"); // Matched with HTML ID
const randomizeOrderCheckbox = document.getElementById("randomizeOrder");
const flipCardsCheckbox = document.getElementById("flipCards"); // Added flip cards checkbox
const includeTOCCheckbox = document.getElementById("includeTOC");
const previewContainer = document.getElementById("previewContainer");
const cardStatusContainer = document.querySelector(".cards-container .status");

const PREVIEW_LIMIT = 3;
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_PT = 15;
const HEADER_HEIGHT_PT = 38.35;
const FOOTER_HEIGHT_PT = 62.52;
const BUTTON_WIDTH_PT = 85.04; // Width for the central "Show" button
const SMALL_BUTTON_WIDTH_PT = 60; // Width for Back/Next buttons
const BUTTON_HEIGHT_PT = 28.35;
const BUTTON_GAP_PT = 10;
const CONTENT_WIDTH_PT = A4_WIDTH_PT - 2 * MARGIN_PT;
const CONTENT_AREA_Y_START = MARGIN_PT + HEADER_HEIGHT_PT + 25;
const CONTENT_AREA_Y_END = A4_HEIGHT_PT - MARGIN_PT - FOOTER_HEIGHT_PT - 25;
const CONTENT_HEIGHT_PT = CONTENT_AREA_Y_END - CONTENT_AREA_Y_START;
const FOOTER_Y_PT = A4_HEIGHT_PT - MARGIN_PT - FOOTER_HEIGHT_PT;
const HEADER_Y_PT = MARGIN_PT;
const DEFAULT_FONT_SIZE = 16;
const LINE_HEIGHT_FACTOR = 1.3;
const MATHJAX_SCALE = 4;

// Hidden div for MathJax to render formulas
const mathJaxContainer = document.createElement("div");
mathJaxContainer.id = "mathjax-container";
mathJaxContainer.style.visibility = "hidden";
mathJaxContainer.style.position = "absolute";
mathJaxContainer.style.zIndex = "-1000";
mathJaxContainer.style.top = "0";
mathJaxContainer.style.left = "0";
document.body.appendChild(mathJaxContainer);

// Hidden div for HTML parsing
const htmlParserDiv = document.createElement("div");
htmlParserDiv.style.visibility = "hidden";
htmlParserDiv.style.position = "absolute";
htmlParserDiv.style.zIndex = "-1000";
document.body.appendChild(htmlParserDiv);

// --- Event Listeners ---
fileInput.addEventListener("change", handleFileSelect);
// Only add event listener if the element exists
if (generatePdfBtn) {
  generatePdfBtn.addEventListener("click", generatePdf);
}

// --- Utility Functions ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Improved TOC content handling.
 * Extracts text from content, handling LaTeX in a more useful way.
 * @param {string} html - HTML content with potential LaTeX
 * @return {string} Meaningful text for TOC
 */
function stripContentForTOC(html) {
  if (!html) return "";

  // Handle LaTeX content better
  const containsOnlyLatex = /^\s*(\\\(.*?\\\)|\\\[.*?\\\])\s*$/g.test(html);

  if (containsOnlyLatex) {
    // Extract content from within LaTeX delimiters
    const latexContent = html.replace(/\\\(|\\\)|\\\[|\\\]/g, "").trim();

    // If it's very short, include it (likely a symbol or brief formula)
    if (latexContent.length < 20) {
      return `Math: ${latexContent}`;
    } else {
      // Otherwise just indicate it's a math expression
      return "Mathematical expression";
    }
  }

  // Regular handling for mixed content
  // Replace LaTeX with [math] but keep surrounding text
  html = html.replace(/\\\(.*?\\\)|\\\[.*?\\\]/gs, "[math]");

  // Clean up HTML tags
  let tmp = document.createElement("DIV");
  html = html.replace(/<\/div>|<\/p>|<\/li>|<br\s*\/?>/gi, " ");
  tmp.innerHTML = html;

  let text = (tmp.textContent || tmp.innerText || "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Limit length
  if (text.length > 40) {
    text = text.substring(0, 37) + "...";
  }

  return text;
}

/**
 * Properly decode HTML entities and handle special characters
 * @param {string} text - The text to decode
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  htmlParserDiv.innerHTML = text;
  return htmlParserDiv.textContent;
}

/**
 * Converts LaTeX formula to SVG using MathJax 3 for high quality rendering
 * @param {string} tex - LaTeX formula
 * @param {boolean} display - True for display mode, false for inline
 * @returns {Promise<{svg: string, width: number, height: number}>} SVG data
 */
function texToSvg(tex, display = false) {
  return new Promise((resolve, reject) => {
    try {
      // Clear previous content
      mathJaxContainer.innerHTML = "";

      // Better options for font size matching
      const fontSize = DEFAULT_FONT_SIZE;
      const options = {
        display: display,
        em: fontSize, // Base font size
        ex: fontSize / 2,
        containerWidth: CONTENT_WIDTH_PT,
      };

      // Create the MathJax output with quality settings
      const node = MathJax.tex2svg(tex, options);
      const svg = node.querySelector("svg");

      // Extract dimensions - we scale based on the DEFAULT_FONT_SIZE
      const widthEx = parseFloat(svg.getAttribute("width").replace("ex", ""));
      const heightEx = parseFloat(svg.getAttribute("height").replace("ex", ""));
      const width = widthEx * (fontSize / 2);
      const height = heightEx * (fontSize / 2);

      // Add viewBox if needed for better scaling
      if (!svg.getAttribute("viewBox")) {
        const bbox = svg.getBBox();
        svg.setAttribute(
          "viewBox",
          `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`
        );
      }

      // Ensure proper sizing attributes
      svg.setAttribute("width", `${width}pt`);
      svg.setAttribute("height", `${height}pt`);

      // Convert to string with proper XML declaration
      const svgString = new XMLSerializer().serializeToString(svg);

      resolve({
        svg: svgString,
        width,
        height,
      });
    } catch (error) {
      console.error("MathJax rendering error:", error);
      reject(error);
    }
  });
}

/**
 * Convert SVG to high-quality PNG via canvas
 * @param {string} svgString - SVG markup as string
 * @param {number} width - Width for rendering
 * @param {number} height - Height for rendering
 * @returns {Promise<string>} Data URL
 */
function svgToDataUrl(svgString, width, height) {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // High resolution for better quality
        canvas.width = width * MATHJAX_SCALE;
        canvas.height = height * MATHJAX_SCALE;

        const ctx = canvas.getContext("2d");
        // Quality improvements
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Transparent background for better integration
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw SVG image with anti-aliasing
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Convert to high-quality PNG
        const dataUrl = canvas.toDataURL("image/png", 1.0);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };

      img.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      };

      img.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Parse HTML content to extract text and formatting
 * @param {string} html - HTML content
 * @returns {Array} Array of objects with text and formatting info
 */
function parseHtmlFormatting(html) {
  if (!html || !html.trim()) {
    return [{ text: "", bold: false, italic: false }];
  }

  // Handle simple HTML tags
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const textSegments = [];
  const processNode = (node, currentFormatting) => {
    const formatting = { ...currentFormatting };

    // Check node type
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) {
        textSegments.push({
          text: node.textContent,
          bold: formatting.bold,
          italic: formatting.italic,
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Update formatting based on element
      if (node.tagName === "B" || node.tagName === "STRONG") {
        formatting.bold = true;
      } else if (node.tagName === "I" || node.tagName === "EM") {
        formatting.italic = true;
      } else if (node.tagName === "BR") {
        textSegments.push({ text: "\n", bold: false, italic: false });
      }

      // Process child nodes with updated formatting
      Array.from(node.childNodes).forEach((child) => {
        processNode(child, formatting);
      });
    }
  };

  processNode(tempDiv, { bold: false, italic: false });
  return textSegments;
}

// --- Core Functions ---
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (fileError) fileError.textContent = "";
  if (pdfError) pdfError.textContent = "";
  cards = [];
  if (cardPreview)
    cardPreview.innerHTML = '<p class="status">Processing file...</p>';
  if (generatePdfBtn) generatePdfBtn.disabled = true;

  // Hide status when no file or invalid file
  if (cardStatusContainer) {
    cardStatusContainer.style.display = "none";
  }

  if (!file) {
    if (fileError) fileError.textContent = "No file selected.";
    if (cardPreview)
      cardPreview.innerHTML =
        '<p class="status">Upload a file to see the preview.</p>';
    if (cardCount) cardCount.textContent = "0";
    return;
  }

  if (!file.name.match(/\.(txt|csv|tsv)$/i)) {
    if (fileError) fileError.textContent = "Invalid file type.";
    if (cardPreview)
      cardPreview.innerHTML =
        '<p class="status">Upload a file to see the preview.</p>';
    if (cardCount) cardCount.textContent = "0";
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const text = e.target.result;
      const lines = text.trim().split(/\r?\n/);
      cards = lines
        .map((line, index) => {
          const parts = line.split("\t");
          const front = parts[0] || "";
          const back = parts[1] || "";
          if (front.trim() || back.trim()) {
            return { front, back, originalIndex: index };
          }
          return null;
        })
        .filter((card) => card !== null);

      if (cards.length === 0) {
        throw new Error("No valid card data found in file.");
      }

      if (cardCount) cardCount.textContent = cards.length;

      // Show status when file is successfully processed
      if (cardStatusContainer) {
        cardStatusContainer.style.display = "inline";
      }

      updatePreview();
      if (generatePdfBtn) generatePdfBtn.disabled = false;
      if (fileError) fileError.textContent = "";
    } catch (error) {
      console.error("Error parsing file:", error);
      if (fileError)
        fileError.textContent = `Error parsing file: ${error.message}`;
      if (cardPreview)
        cardPreview.innerHTML = '<p class="error">Could not parse file.</p>';
      if (cardCount) cardCount.textContent = "0";
      cards = [];
      if (generatePdfBtn) generatePdfBtn.disabled = true;

      // Hide status on error
      if (cardStatusContainer) {
        cardStatusContainer.style.display = "none";
      }
    }
  };

  reader.onerror = function (e) {
    console.error("FileReader error:", e);
    if (fileError) fileError.textContent = "Error reading file.";
    if (cardPreview)
      cardPreview.innerHTML = '<p class="error">Error reading file.</p>';
    if (cardCount) cardCount.textContent = "0";
    cards = [];
    if (generatePdfBtn) generatePdfBtn.disabled = true;

    // Hide status on error
    if (cardStatusContainer) {
      cardStatusContainer.style.display = "none";
    }
  };

  // Use UTF-8 encoding for proper handling of accented characters
  reader.readAsText(file, "UTF-8");
}

function deleteCard(originalIndex) {
  console.log(`Attempting delete: originalIndex=${originalIndex}`);
  const cardIndexToDelete = cards.findIndex(
    (card) => card.originalIndex === originalIndex
  );

  if (cardIndexToDelete > -1) {
    cards.splice(cardIndexToDelete, 1);
    console.log(`Card deleted. Remaining: ${cards.length}`);
    if (cardCount) cardCount.textContent = cards.length;
    updatePreview();

    // Hide status if all cards are deleted
    if (cards.length === 0) {
      if (generatePdfBtn) generatePdfBtn.disabled = true;
      if (cardStatusContainer) {
        cardStatusContainer.style.display = "none";
      }
    }
  } else {
    console.warn(`Card with original index ${originalIndex} not found.`);
  }
}

/**
 * Improves MathJax rendering in the preview cards with better display and error handling
 */
function enhanceMathJaxPreview() {
  // Find all MathJax elements in the preview
  const mathElements = document.querySelectorAll(".preview-card .mjx-chtml");

  mathElements.forEach((mathEl) => {
    // Ensure overflow is visible to prevent clipping of larger rendered math
    mathEl.style.overflow = "visible";

    // Add a subtle highlight effect
    mathEl.addEventListener("mouseover", () => {
      mathEl.style.backgroundColor = "rgba(232, 237, 255, 0.4)";
    });

    mathEl.addEventListener("mouseout", () => {
      mathEl.style.backgroundColor = "transparent";
    });

    // Find SVG within MathJax element and enhance it
    const svg = mathEl.querySelector("svg");
    if (svg) {
      // Ensure SVG is visible and properly sized
      svg.style.overflow = "visible";
      svg.style.display = "inline-block";

      // For display mode, make sure it's centered
      if (mathEl.classList.contains("MJXc-display")) {
        mathEl.style.width = "100%";
        mathEl.style.textAlign = "center";
        mathEl.style.margin = "1rem 0";

        // Add subtle styling
        mathEl.style.padding = "0.5rem";
        mathEl.style.borderRadius = "4px";
        mathEl.style.background = "rgba(245, 247, 250, 0.5)";
      }
    }
  });

  // Look for math errors and style them
  const mathErrors = document.querySelectorAll(".preview-card .mjx-error");
  mathErrors.forEach((error) => {
    error.style.color = "var(--red)";
    error.style.border = "1px dashed var(--red)";
    error.style.padding = "0.5rem";
    error.style.margin = "0.5rem 0";
    error.style.borderRadius = "4px";
    error.style.fontSize = "0.9rem";
    error.style.fontFamily = "monospace";
    error.style.background = "rgba(254, 226, 226, 0.5)";
  });
}

// Update the preview with processed text and LaTeX
async function updatePreview() {
  if (!cardPreview) return;

  cardPreview.innerHTML = "";
  if (cards.length === 0) {
    cardPreview.innerHTML = '<p class="status">No cards loaded.</p>';
    if (generatePdfBtn) generatePdfBtn.disabled = true;
    return;
  }

  if (generatePdfBtn) generatePdfBtn.disabled = false;
  const previewCardsToShow = cards.slice(0, PREVIEW_LIMIT);
  const flipCards = flipCardsCheckbox && flipCardsCheckbox.checked;

  // Add loading indicator with animation
  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "status";
  loadingIndicator.innerHTML =
    '<div class="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-gray-900 mr-2"></div> Rendering preview...';
  cardPreview.appendChild(loadingIndicator);

  // Create cards
  for (const card of previewCardsToShow) {
    const cardDiv = document.createElement("div");
    cardDiv.className = `preview-card`;
    cardDiv.dataset.originalIndex = card.originalIndex;

    const frontDiv = document.createElement("div");
    frontDiv.className = flipCards ? "back" : "front";
    frontDiv.innerHTML = flipCards ? card.back : card.front;

    const backDiv = document.createElement("div");
    backDiv.className = flipCards ? "front" : "back";
    backDiv.innerHTML = flipCards ? card.front : card.back;

    // Improved delete button with a more visible red trash icon
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-card-btn";
    deleteBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>`;
    deleteBtn.title = "Remove this card";
    deleteBtn.onclick = (event) => {
      event.stopPropagation();
      const cardElement = event.target.closest(".preview-card");
      if (cardElement) {
        // Add a brief animation effect when removing a card
        cardElement.style.transition = "all 0.3s ease";
        cardElement.style.opacity = "0";
        cardElement.style.transform = "translateX(10px)";

        // After animation completes, actually delete the card
        setTimeout(() => {
          const indexToDelete = parseInt(cardElement.dataset.originalIndex, 10);
          deleteCard(indexToDelete);
        }, 250);
      }
    };

    cardDiv.appendChild(deleteBtn);
    cardDiv.appendChild(frontDiv);
    cardDiv.appendChild(backDiv);
    cardPreview.appendChild(cardDiv);
  }

  // Remove loading indicator
  if (loadingIndicator.parentNode === cardPreview) {
    cardPreview.removeChild(loadingIndicator);
  }

  // Render LaTeX in preview with improved sizing
  if (typeof MathJax !== "undefined" && MathJax.typeset) {
    try {
      // Add more stylish math processing indicator
      const mathProcessingIndicator = document.createElement("div");
      mathProcessingIndicator.className = "status";
      mathProcessingIndicator.innerHTML =
        '<div class="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-indigo-500 mr-2"></div> Processing math expressions...';
      cardPreview.appendChild(mathProcessingIndicator);

      // Small delay to let the browser render the math processing message
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Typeset the math
      await MathJax.typeset([cardPreview]);

      // Remove the processing indicator
      if (cardPreview.contains(mathProcessingIndicator)) {
        cardPreview.removeChild(mathProcessingIndicator);
      }

      // Enhanced MathJax rendering function
      enhanceMathJaxPreview();
    } catch (e) {
      console.error("Error typesetting MathJax:", e);
      const errorMsg = document.createElement("div");
      errorMsg.className = "error";
      errorMsg.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Error rendering math expressions. Some formulas might not display correctly.';
      cardPreview.appendChild(errorMsg);
    }
  }
}

/**
 * Adds a decorative title page to the PDF.
 * @param {jsPDF} doc - The jsPDF document instance.
 * @param {string} deckTitle - The title of the deck.
 */
function addTitlePage(doc, deckTitle) {
  // Page 1: Title Page
  doc.setPage(1); // Explicitly set to page 1

  // --- Title ---
  doc.setFontSize(36);
  doc.setFont("Helvetica", "bold");
  doc.setTextColor(30, 30, 30); // Dark Gray
  doc.text(deckTitle, A4_WIDTH_PT / 2, A4_HEIGHT_PT / 3, {
    align: "center",
  });

  // --- Subtitle ---
  doc.setFontSize(18);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(50, 50, 50); // Medium Gray
  doc.text("Flashcard Deck", A4_WIDTH_PT / 2, A4_HEIGHT_PT / 3 + 40, {
    align: "center",
  });

  // --- Decorative Line ---
  doc.setDrawColor(100, 100, 100); // Light Gray
  doc.setLineWidth(1.5);
  const lineY = A4_HEIGHT_PT / 3 + 60;
  const lineMargin = A4_WIDTH_PT / 4; // Make line shorter than page width
  doc.line(lineMargin, lineY, A4_WIDTH_PT - lineMargin, lineY);

  // --- Optional: Generation Date ---
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100); // Lighter Gray
  const generationDate = new Date().toLocaleDateString();
  doc.text(
    `Generated on: ${generationDate}`,
    A4_WIDTH_PT / 2,
    A4_HEIGHT_PT - MARGIN_PT * 2, // Position near bottom
    { align: "center" }
  );

  // Reset styles
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(0);
  doc.setLineWidth(0.2); // Reset line width if needed elsewhere
}

/**
 * Generates the interactive PDF using jsPDF and MathJax for LaTeX
 */
async function generatePdf() {
  // --- Dependency Checks ---
  if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
    if (pdfError) pdfError.textContent = "jsPDF is not loaded.";
    return;
  }

  if (typeof MathJax === "undefined") {
    if (pdfError) pdfError.textContent = "MathJax is not loaded.";
    return;
  }

  if (cards.length === 0) {
    if (pdfError) pdfError.textContent = "No cards available.";
    return;
  }

  // --- Setup ---
  if (generatePdfBtn) generatePdfBtn.disabled = true;
  if (loadingIndicator) loadingIndicator.style.display = "block";
  if (progressIndicator) progressIndicator.textContent = "(Initializing...)";
  if (pdfError) pdfError.textContent = "";

  const deckTitle = deckTitleInput
    ? deckTitleInput.value || "My Flashcards"
    : "My Flashcards";
  const randomize = randomizeOrderCheckbox && randomizeOrderCheckbox.checked;
  const flipCards = flipCardsCheckbox && flipCardsCheckbox.checked; // Get flip cards setting
  const includeTOC = includeTOCCheckbox && includeTOCCheckbox.checked;

  let processedCards = [...cards];
  if (randomize) {
    processedCards.sort(() => Math.random() - 0.5);
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    putOnlyUsedFonts: true,
    floatPrecision: "smart",
  });

  // Add font variations for bold and italic
  doc.setFont("Helvetica", "normal");

  let linksToAdd = [];
  let tocEntries = [];
  let tocPageCount = 0;
  const titlePageCount = 1;

  // --- Add Title Page ---
  addTitlePage(doc, deckTitle);

  // --- Pre-calculate TOC Pages & Add Placeholders ---
  if (includeTOC && processedCards.length > 0) {
    const tocLineHeight = 18;
    const tocStartY = MARGIN_PT + 60;
    const linesPerCol = Math.floor(
      (A4_HEIGHT_PT - MARGIN_PT - tocStartY) / tocLineHeight
    );
    // Ensure at least one line per column if content area is very small
    const linesPerPage = Math.max(1, linesPerCol * 2);
    tocPageCount = Math.ceil(processedCards.length / linesPerPage);
  }

  const pageOffset = titlePageCount + tocPageCount;

  for (let p = 0; p < tocPageCount; p++) {
    doc.addPage();
  }

  // --- Calculate Total Pages ---
  const totalPages = titlePageCount + tocPageCount + processedCards.length * 2;

  // --- Card Page Generation Loop ---
  try {
    for (let i = 0; i < processedCards.length; i++) {
      const card = processedCards[i];
      const cardIndex = i + 1; // 1-based index for display
      // Page numbers are calculated using the new offset
      const frontPageNum = pageOffset + i * 2 + 1;
      const backPageNum = pageOffset + i * 2 + 2;
      const cardIdentifier = `Card ${cardIndex}`;

      if (progressIndicator)
        progressIndicator.textContent = `(${cardIdentifier} of ${processedCards.length}...)`;
      console.log(
        `Generating ${cardIdentifier}: Front ${frontPageNum}, Back ${backPageNum}`
      );

      // Handle the card content based on flip cards preference
      const frontContent = flipCards ? card.back : card.front;
      const backContent = flipCards ? card.front : card.back;
      const frontLabel = flipCards ? "Definition" : "Word";
      const backLabel = flipCards ? "Word" : "Definition";

      if (includeTOC) {
        const tocText = stripContentForTOC(frontContent);
        tocEntries.push({
          text: `${cardIdentifier}: ${tocText}`,
          targetPage: frontPageNum,
        });
      }

      // --- Render Front Page ---
      // Add page *after* the title and TOC placeholders
      doc.addPage();
      doc.setPage(frontPageNum);
      addPageHeader(doc, deckTitle, cardIndex, processedCards.length);
      await addCardContentWithMathJax(
        doc,
        frontContent,
        cardIdentifier + " " + frontLabel
      );
      addPageFooter(
        doc,
        "Show " + backLabel,
        backPageNum,
        "Show " + frontLabel,
        frontPageNum,
        true, // isFront
        frontPageNum,
        totalPages, // Pass updated totalPages
        cardIndex,
        processedCards.length,
        pageOffset, // Pass updated pageOffset
        linksToAdd
      );

      // --- Render Back Page ---
      doc.addPage();
      doc.setPage(backPageNum);
      addPageHeader(doc, deckTitle, cardIndex, processedCards.length);
      await addCardContentWithMathJax(
        doc,
        backContent,
        cardIdentifier + " " + backLabel
      );
      addPageFooter(
        doc,
        "Show " + backLabel,
        backPageNum,
        "Show " + frontLabel,
        frontPageNum,
        false, // isFront
        backPageNum,
        totalPages, // Pass updated totalPages
        cardIndex,
        processedCards.length,
        pageOffset, // Pass updated pageOffset
        linksToAdd
      );
    } // End of card loop

    // --- Generate TOC Content & Final Link Pass ---
    if (progressIndicator)
      progressIndicator.textContent = "(Generating TOC & Links...)";
    if (includeTOC && tocEntries.length > 0) {
      console.log(`Generating TOC content on ${tocPageCount} pages.`);
      const tocLineHeight = 18;
      const tocStartY = MARGIN_PT + 60;
      const linesPerCol = Math.floor(
        (A4_HEIGHT_PT - MARGIN_PT - tocStartY) / tocLineHeight
      );
      const linesPerPage = Math.max(1, linesPerCol * 2);
      const tocColWidth = (A4_WIDTH_PT - 2 * MARGIN_PT - 30) / 2;
      let currentTocPageRelative = 1;
      let tocY = tocStartY;
      let col = 0;

      for (let idx = 0; idx < tocEntries.length; idx++) {
        const item = tocEntries[idx];
        // Absolute page index includes title page
        const currentTocAbsPageIndex = titlePageCount + currentTocPageRelative;

        // Page break logic
        if (idx > 0 && idx % linesPerPage === 0) {
          currentTocPageRelative++;
          col = 0;
          tocY = tocStartY;
        } else if (idx > 0 && idx % linesPerCol === 0) {
          col++;
          tocY = tocStartY;
        }

        // Set context to the correct absolute TOC page
        doc.setPage(currentTocAbsPageIndex);

        // Add TOC Title only once per page
        if (tocY === tocStartY && col === 0) {
          doc.setFontSize(20); // Larger TOC title
          doc.setFont("Helvetica", "bold");
          doc.setTextColor(50);
          const tocTitleText =
            currentTocPageRelative === 1
              ? "Table of Contents"
              : "Table of Contents (cont.)";
          doc.text(tocTitleText, A4_WIDTH_PT / 2, MARGIN_PT + 25, {
            align: "center",
          }); // Centered title
          doc.setFont("Helvetica", "normal"); // Reset font
          doc.setTextColor(0);
        }

        // Calculate X position for the column
        // Added gap between columns
        const tocX = MARGIN_PT + col * (tocColWidth + 30);
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 220);

        // Truncate text if needed (though already done in tocEntries)
        const displayText = doc.splitTextToSize(item.text, tocColWidth);

        // Add text and link
        doc.textWithLink(displayText[0], tocX, tocY, {
          url: `#page=${item.targetPage}`,
          targetPage: item.targetPage,
        });

        doc.setTextColor(0);
        tocY += tocLineHeight;
      }
    }

    console.log(`Adding ${linksToAdd.length} footer links...`);

    // IMPORTANT FIX: Use direct page links with jsPDF
    // This is a more reliable way to add navigation links in the PDF
    linksToAdd.forEach((linkInfo) => {
      if (linkInfo.targetPage > 0 && linkInfo.targetPage <= totalPages) {
        doc.setPage(linkInfo.pageNum);
        try {
          // Fixed link creation method
          doc.link(linkInfo.x, linkInfo.y, linkInfo.w, linkInfo.h, {
            pageNumber: linkInfo.targetPage,
          });
        } catch (e) {
          console.error(
            `Error adding link on page ${linkInfo.pageNum} to ${linkInfo.targetPage}:`,
            e
          );
        }
      } else {
        console.warn(
          `Skipping link on page ${linkInfo.pageNum} to invalid target ${linkInfo.targetPage} (Total: ${totalPages})`
        );
      }
    });

    // --- Save PDF ---
    if (progressIndicator) progressIndicator.textContent = "(Saving PDF...)";
    // Remove the first blank page jsPDF might add automatically if we didn't use setPage(1) initially
    if (titlePageCount > 0 && doc.getNumberOfPages() > totalPages) {
      console.log("Removing initial blank page potentially added by jsPDF.");
    }

    doc.save(`${deckTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`);
    if (pdfError) pdfError.textContent = "";
  } catch (error) {
    console.error("Error during PDF generation loop:", error);
    if (pdfError)
      pdfError.textContent = `Error generating PDF: ${
        error?.message || "Unknown error"
      }. Check console.`;
  } finally {
    if (generatePdfBtn) generatePdfBtn.disabled = false;
    if (loadingIndicator) loadingIndicator.style.display = "none";
    if (progressIndicator) progressIndicator.textContent = "";
  }
}

/** Adds page header */
function addPageHeader(doc, title, cardIndex, totalCards) {
  doc.setFontSize(14);
  doc.setTextColor(50);
  doc.text(title, MARGIN_PT, HEADER_Y_PT + HEADER_HEIGHT_PT / 2 + 4, {
    align: "left",
    baseline: "middle", // Ensure vertical centering
  });
  const countText = `Card ${cardIndex} / ${totalCards}`;
  doc.text(
    countText,
    A4_WIDTH_PT - MARGIN_PT,
    HEADER_Y_PT + HEADER_HEIGHT_PT / 2 + 4,
    { align: "right", baseline: "middle" } // Ensure vertical centering
  );
  doc.setDrawColor(100);
  doc.line(
    MARGIN_PT,
    HEADER_Y_PT + HEADER_HEIGHT_PT,
    A4_WIDTH_PT - MARGIN_PT,
    HEADER_Y_PT + HEADER_HEIGHT_PT
  );
  doc.setTextColor(0);
}

/**
 * Renders card content with HTML formatting and LaTeX formulas onto the PDF page.
 * @param {jsPDF} doc - The jsPDF document instance.
 * @param {string} content - The HTML content with potential LaTeX formulas.
 * @param {string} contentIdentifier - A string identifying the content for logging.
 */
async function addCardContentWithMathJax(doc, content, contentIdentifier) {
  console.log(`Rendering content for: ${contentIdentifier}`);

  if (!content || !content.trim()) {
    console.log(`[${contentIdentifier}] Content is empty.`);
    return;
  }

  // 1. Extract all LaTeX expressions with their positions
  const inlineLatexRegex = /\\\((.*?)\\\)/g;
  const displayLatexRegex = /\\\[(.*?)\\\]/g;
  const latexMatches = [];

  // Find all inline LaTeX
  let match;
  while ((match = inlineLatexRegex.exec(content)) !== null) {
    latexMatches.push({
      type: "inline",
      formula: match[1],
      start: match.index,
      end: match.index + match[0].length,
      original: match[0],
    });
  }

  // Find all display LaTeX
  while ((match = displayLatexRegex.exec(content)) !== null) {
    latexMatches.push({
      type: "display",
      formula: match[1],
      start: match.index,
      end: match.index + match[0].length,
      original: match[0],
    });
  }

  // Sort by start position
  latexMatches.sort((a, b) => a.start - b.start);

  // 2. Process content by splitting at LaTeX expressions
  let currentY = CONTENT_AREA_Y_START;
  let lastIndex = 0;

  for (let i = 0; i < latexMatches.length; i++) {
    const latex = latexMatches[i];

    // Process text before this LaTeX
    if (latex.start > lastIndex) {
      const textSegment = content.substring(lastIndex, latex.start);
      if (textSegment.trim()) {
        // Handle HTML formatting in this text segment
        currentY = await renderFormattedText(
          doc,
          textSegment,
          MARGIN_PT,
          currentY
        );
      }
    }

    // Process the LaTeX formula
    try {
      // Convert LaTeX to SVG
      const svgData = await texToSvg(latex.formula, latex.type === "display");

      // Convert SVG to Data URL (PNG)
      const dataUrl = await svgToDataUrl(
        svgData.svg,
        svgData.width,
        svgData.height
      );

      // Calculate appropriate dimensions
      let imgWidth = svgData.width;
      let imgHeight = svgData.height;

      // Scale if necessary
      const maxWidth = CONTENT_WIDTH_PT - (latex.type === "display" ? 0 : 20);
      if (imgWidth > maxWidth) {
        const scale = maxWidth / imgWidth;
        imgWidth *= scale;
        imgHeight *= scale;
      }

      // Center display formulas, indent inline ones
      const xPos =
        latex.type === "display"
          ? MARGIN_PT + (CONTENT_WIDTH_PT - imgWidth) / 2
          : MARGIN_PT + 10;

      // Ensure we don't exceed page boundaries
      if (currentY + imgHeight > CONTENT_AREA_Y_END) {
        // Handle overflow if needed
        console.log(`[${contentIdentifier}] LaTeX overflow - potential issue`);
        // Basic overflow handling: just continue drawing
      }

      // Add the image to PDF with high quality
      doc.addImage(
        dataUrl,
        "PNG",
        xPos,
        currentY,
        imgWidth,
        imgHeight,
        undefined,
        "FAST"
      );

      // Advance Y position
      currentY += imgHeight + (latex.type === "display" ? 10 : 5);
    } catch (error) {
      console.error(`Error rendering LaTeX formula: ${latex.formula}`, error);

      // Fallback: render the raw LaTeX as text
      const fallbackText = `[LaTeX Error: ${latex.original}]`;
      doc.setFontSize(DEFAULT_FONT_SIZE);
      doc.setTextColor(75);
      const lines = doc.splitTextToSize(fallbackText, CONTENT_WIDTH_PT);
      doc.text(lines, MARGIN_PT, currentY, { baseline: "top" });
      doc.setTextColor(0);

      currentY += lines.length * DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR + 5;
    }

    lastIndex = latex.end;
  }

  // 3. Process any remaining text after the last LaTeX
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex);
    if (remainingText.trim()) {
      currentY = await renderFormattedText(
        doc,
        remainingText,
        MARGIN_PT,
        currentY
      );
    }
  }

  console.log(`[${contentIdentifier}] Finished rendering content.`);
}

/**
 * Renders text with HTML formatting (bold, italic)
 * @param {jsPDF} doc - The PDF document
 * @param {string} html - HTML content to render
 * @param {number} x - Starting X position
 * @param {number} y - Starting Y position
 * @returns {number} The updated Y position
 */
async function renderFormattedText(doc, html, x, y) {
  // Decode HTML entities first
  const decodedHtml = decodeHtmlEntities(html);

  // Parse HTML to get text segments with formatting
  const segments = parseHtmlFormatting(decodedHtml); // Use decoded HTML for parsing

  let currentY = y;
  let currentX = x;
  let lineHeight = DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR;

  // Function to render a line segment
  const renderSegment = (text, bold, italic) => {
    let fontStyle = "normal";
    if (bold && italic) fontStyle = "bolditalic";
    else if (bold) fontStyle = "bold";
    else if (italic) fontStyle = "italic";

    doc.setFont("Helvetica", fontStyle);
    doc.setFontSize(DEFAULT_FONT_SIZE);

    const words = text.split(/(\s+)/); // Split by spaces, keeping spaces
    for (const word of words) {
      if (!word) continue; // Skip empty strings from split

      const wordWidth = doc.getStringUnitWidth(word) * DEFAULT_FONT_SIZE;

      // Check for line break
      if (word === "\n" || currentX + wordWidth > x + CONTENT_WIDTH_PT) {
        currentY += lineHeight;
        currentX = x;
        if (word === "\n" || word.trim() === "") continue; // Skip rendering newline/space at start of new line
      }

      // Render the word/space
      doc.text(word, currentX, currentY, { baseline: "top" });
      currentX += wordWidth;
    }
  };

  for (const segment of segments) {
    if (segment.text === "\n") {
      currentY += lineHeight;
      currentX = x;
    } else {
      renderSegment(segment.text, segment.bold, segment.italic);
    }
  }

  // Reset font to normal and advance Y after the block
  doc.setFont("Helvetica", "normal");
  return currentY + (currentX > x ? lineHeight : 0) + 5; // Add space after the text block
}

/** Adds page footer visuals and stores link information */
function addPageFooter(
  doc,
  nextLabel, // "Show Answer"
  nextPageNum, // Back page num
  prevLabel, // "Show Question"
  prevPageNum, // Front page num
  isFront,
  currentPageNum,
  totalPages,
  cardIndex, // 1-based index of the current card
  totalCards,
  pageOffset,
  linksToAdd
) {
  doc.setDrawColor(100);
  doc.line(MARGIN_PT, FOOTER_Y_PT, A4_WIDTH_PT - MARGIN_PT, FOOTER_Y_PT);

  const buttonY = FOOTER_Y_PT + (FOOTER_HEIGHT_PT - BUTTON_HEIGHT_PT) / 2;

  // Determine which buttons should be visible
  const showBackButton = cardIndex > 1;
  const showNextButton = cardIndex < totalCards;

  // Calculate total width and starting position based on visible buttons
  let currentTotalButtonWidth = BUTTON_WIDTH_PT; // Always show the middle button
  let currentStartX;
  let backButtonX = 0; // Initialize positions
  let showButtonX = 0;
  let nextButtonX = 0;

  if (showBackButton) {
    currentTotalButtonWidth += SMALL_BUTTON_WIDTH_PT + BUTTON_GAP_PT;
  }
  if (showNextButton) {
    currentTotalButtonWidth += SMALL_BUTTON_WIDTH_PT + BUTTON_GAP_PT;
  }

  currentStartX = MARGIN_PT + (CONTENT_WIDTH_PT - currentTotalButtonWidth) / 2;

  // Calculate X positions dynamically
  let currentX = currentStartX;
  if (showBackButton) {
    backButtonX = currentX;
    currentX += SMALL_BUTTON_WIDTH_PT + BUTTON_GAP_PT;
  }
  showButtonX = currentX;
  currentX += BUTTON_WIDTH_PT + BUTTON_GAP_PT;
  if (showNextButton) {
    nextButtonX = currentX;
  }

  // --- Draw Buttons ---
  doc.setFillColor(200, 200, 200);
  doc.setDrawColor(100);

  // Back Button (Conditional)
  if (showBackButton) {
    doc.roundedRect(
      backButtonX,
      buttonY,
      SMALL_BUTTON_WIDTH_PT,
      BUTTON_HEIGHT_PT,
      5,
      5,
      "FD"
    );
  }

  // Show Answer/Question Button (Always Visible)
  doc.roundedRect(
    showButtonX,
    buttonY,
    BUTTON_WIDTH_PT,
    BUTTON_HEIGHT_PT,
    5,
    5,
    "FD"
  );

  // Next Button (Conditional)
  if (showNextButton) {
    doc.roundedRect(
      nextButtonX,
      buttonY,
      SMALL_BUTTON_WIDTH_PT,
      BUTTON_HEIGHT_PT,
      5,
      5,
      "FD"
    );
  }

  // --- Add Button Text & Links ---
  doc.setFontSize(10);
  doc.setTextColor(50);

  // Back Button Text & Link (Conditional)
  if (showBackButton) {
    doc.text(
      "Back",
      backButtonX + SMALL_BUTTON_WIDTH_PT / 2,
      buttonY + BUTTON_HEIGHT_PT / 2,
      {
        align: "center",
        baseline: "middle",
      }
    );
    // Link to the FRONT page of the PREVIOUS card
    const backCardTargetPage = pageOffset + (cardIndex - 2) * 2 + 1;

    // FIX: Store the page link data with correct coordinates
    linksToAdd.push({
      pageNum: currentPageNum,
      x: backButtonX,
      y: buttonY,
      w: SMALL_BUTTON_WIDTH_PT,
      h: BUTTON_HEIGHT_PT,
      targetPage: backCardTargetPage,
    });
  }

  // Show Answer/Question Text & Link (Always Visible)
  const mainButtonLabel = isFront ? nextLabel : prevLabel;
  const mainButtonTargetPage = isFront ? nextPageNum : prevPageNum;
  doc.text(
    mainButtonLabel,
    showButtonX + BUTTON_WIDTH_PT / 2,
    buttonY + BUTTON_HEIGHT_PT / 2,
    { align: "center", baseline: "middle" }
  );

  // FIX: Store the page link data with correct coordinates
  linksToAdd.push({
    pageNum: currentPageNum,
    x: showButtonX,
    y: buttonY,
    w: BUTTON_WIDTH_PT,
    h: BUTTON_HEIGHT_PT,
    targetPage: mainButtonTargetPage,
  });

  // Next Button Text & Link (Conditional)
  if (showNextButton) {
    doc.text(
      "Next",
      nextButtonX + SMALL_BUTTON_WIDTH_PT / 2,
      buttonY + BUTTON_HEIGHT_PT / 2,
      {
        align: "center",
        baseline: "middle",
      }
    );
    // Link to the FRONT page of the NEXT card
    const nextCardTargetPage = pageOffset + cardIndex * 2 + 1;

    // FIX: Store the page link data with correct coordinates
    linksToAdd.push({
      pageNum: currentPageNum,
      x: nextButtonX,
      y: buttonY,
      w: SMALL_BUTTON_WIDTH_PT,
      h: BUTTON_HEIGHT_PT,
      targetPage: nextCardTargetPage,
    });
  }

  // --- Page Number ---
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    `Page ${currentPageNum} / ${totalPages}`,
    A4_WIDTH_PT / 2,
    A4_HEIGHT_PT - MARGIN_PT,
    { align: "center" }
  );
  doc.setTextColor(0); // Reset text color
}

// ----------------------------------------------------------------------------------------------------------------

// --- Template Generation ---
// Get template-related DOM elements
const templateCardCountInput = document.getElementById("templateCardCount");
const templateTitleInput = document.getElementById("importDeckTitle"); // Matched with HTML ID
const generateTemplateBtn = document.getElementById("generatePdfBtnTemplate"); // Matched with HTML ID

// Add event listener to template generation button if element exists
if (generateTemplateBtn) {
  generateTemplateBtn.addEventListener("click", generateTemplatePdf);
}

/**
 * Generates an empty flashcard template PDF
 */
async function generateTemplatePdf() {
  // --- Dependency Checks ---
  if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
    alert("Error: jsPDF is not loaded.");
    return;
  }

  if (typeof MathJax === "undefined") {
    alert("Error: MathJax is not loaded.");
    return;
  }

  // --- Setup ---
  if (generateTemplateBtn) generateTemplateBtn.disabled = true;
  const templateCount =
    parseInt(templateCardCountInput ? templateCardCountInput.value : 10) || 10;
  const templateTitle = templateTitleInput
    ? templateTitleInput.value || "Flashcard_Template"
    : "Flashcard_Template";

  // Validate input
  if (templateCount <= 0 || templateCount > 500) {
    alert("Please enter a number between 1 and 500 for the card count.");
    if (generateTemplateBtn) generateTemplateBtn.disabled = false;
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    putOnlyUsedFonts: true,
    floatPrecision: "smart",
  });

  // Add font variations for bold and italic
  doc.setFont("Helvetica", "normal");

  let linksToAdd = [];
  const titlePageCount = 1; // Add a title page
  const pageOffset = titlePageCount; // Offset for card pages
  const totalPages = titlePageCount + templateCount * 2; // Total pages including title

  try {
    // --- Add Title Page ---
    addTitlePage(doc, templateTitle);

    // --- Card Page Generation Loop ---
    for (let i = 0; i < templateCount; i++) {
      const cardIndex = i + 1; // 1-based index for display
      // Calculate page numbers with offset
      const frontPageNum = pageOffset + i * 2 + 1;
      const backPageNum = pageOffset + i * 2 + 2;
      const cardIdentifier = `Card ${cardIndex}`;

      // --- Render Front Page ---
      doc.addPage(); // Add page for the front card
      doc.setPage(frontPageNum);
      addPageHeader(doc, templateTitle, cardIndex, templateCount);
      // Add placeholder content area if desired (optional)
      // doc.rect(MARGIN_PT, CONTENT_AREA_Y_START, CONTENT_WIDTH_PT, CONTENT_HEIGHT_PT, 'S'); // Example outline

      addPageFooter(
        doc,
        "Show Answer",
        backPageNum,
        "Show Question",
        frontPageNum,
        true, // isFront
        frontPageNum,
        totalPages, // Pass updated totalPages
        cardIndex,
        templateCount,
        pageOffset, // Pass the offset
        linksToAdd
      );

      // --- Render Back Page ---
      doc.addPage(); // Add page for the back card
      doc.setPage(backPageNum);
      addPageHeader(doc, templateTitle, cardIndex, templateCount);
      // Add placeholder content area if desired (optional)
      // doc.rect(MARGIN_PT, CONTENT_AREA_Y_START, CONTENT_WIDTH_PT, CONTENT_HEIGHT_PT, 'S'); // Example outline

      addPageFooter(
        doc,
        "Show Answer",
        backPageNum,
        "Show Question",
        frontPageNum,
        false, // isFront
        backPageNum,
        totalPages, // Pass updated totalPages
        cardIndex,
        templateCount,
        pageOffset, // Pass the offset
        linksToAdd
      );
    }

    // --- Add links ---
    console.log(`Adding ${linksToAdd.length} links to template...`);
    linksToAdd.forEach((linkInfo) => {
      if (linkInfo.targetPage > 0 && linkInfo.targetPage <= totalPages) {
        doc.setPage(linkInfo.pageNum);
        try {
          // FIX: Consistent approach for adding links
          doc.link(linkInfo.x, linkInfo.y, linkInfo.w, linkInfo.h, {
            pageNumber: linkInfo.targetPage,
          });
        } catch (e) {
          console.error(
            `Error adding link on template page ${linkInfo.pageNum} to ${linkInfo.targetPage}:`,
            e
          );
        }
      } else {
        console.warn(
          `Skipping link on template page ${linkInfo.pageNum} to invalid target ${linkInfo.targetPage} (Total: ${totalPages})`
        );
      }
    });

    // --- Save PDF ---
    doc.save(
      `${templateTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_template.pdf`
    );
  } catch (error) {
    console.error("Error generating template PDF:", error);
    alert(
      `Error generating template PDF: ${error?.message || "Unknown error"}`
    );
  } finally {
    if (generateTemplateBtn) generateTemplateBtn.disabled = false;
  }
}

// Add event listeners for the tab switching functionality from script.js if not present
document.addEventListener("DOMContentLoaded", function () {
  const importButton = document.getElementById("importButton");
  const templateButton = document.getElementById("templateButton");
  const importSection = document.getElementById("importSection");
  const templateSection = document.getElementById("templateSection");

  if (importButton && templateButton && importSection && templateSection) {
    importButton.addEventListener("click", function () {
      importButton.classList.add("active");
      templateButton.classList.remove("active");
      importSection.style.display = "block";
      templateSection.style.display = "none";
    });

    templateButton.addEventListener("click", function () {
      templateButton.classList.add("active");
      importButton.classList.remove("active");
      templateSection.style.display = "block";
      importSection.style.display = "none";
    });
  }

  // Hide the card count status initially
  if (cardStatusContainer) {
    cardStatusContainer.style.display = "none";
  }

  // Add auto-resize to text inputs
  const textInputs = document.querySelectorAll(".text-input");
  textInputs.forEach((input) => {
    const helperId = input.getAttribute("data-helper-id");
    const helper = document.getElementById(helperId);

    if (helper) {
      const updateWidth = () => {
        helper.textContent = input.value || input.placeholder;
        input.style.width = helper.offsetWidth + "px";
      };

      input.addEventListener("input", updateWidth);
      // Initial width calculation
      updateWidth();
    }
  });
});
