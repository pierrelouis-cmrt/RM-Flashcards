///------------------------------ ORB ----------------------------------------

const orbContainer = document.querySelector(".orb-container");
const orb = document.querySelector(".orb");

// Track mouse position relative to center of window
let mouseX = 0,
  mouseY = 0;
let targetX = 0,
  targetY = 0;
let currentX = 0,
  currentY = 0;

// Handle mouse movement
document.addEventListener("mousemove", (e) => {
  // Calculate mouse position relative to center of window
  mouseX = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
  mouseY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);

  // Set target positions with limited movement range
  targetX = mouseX * +6;
  targetY = mouseY * +6;
});

// Simple animation loop for smooth movement
function animate() {
  // Smooth transition to target position
  currentX += (targetX - currentX) * 0.08;
  currentY += (targetY - currentY) * 0.08;

  // Apply transformation
  orb.style.transform = `translate(${currentX}px, ${currentY}px)`;

  requestAnimationFrame(animate);
}

// Start animation
animate();

// Add click interaction (simple scale effect)
orb.addEventListener("mousedown", () => {
  orb.style.transform = `translate(${currentX}px, ${currentY}px) scale(0.97)`;
});

document.addEventListener("mouseup", () => {
  orb.style.transform = `translate(${currentX}px, ${currentY}px) scale(1)`;
});

/// ------------------------------ NAVBAR -------------------------------------

document.getElementById("importButton").addEventListener("click", function () {
  document.getElementById("importSection").style.display = "block";
  document.getElementById("templateSection").style.display = "none";
  document.getElementById("importButton").classList.add("active");
  document.getElementById("templateButton").classList.remove("active");
});

document
  .getElementById("templateButton")
  .addEventListener("click", function () {
    document.getElementById("importSection").style.display = "none";
    document.getElementById("templateSection").style.display = "block";
    document.getElementById("importButton").classList.remove("active");
    document.getElementById("templateButton").classList.add("active");
  });

///------------------------------ TEXT INPUT DYNAMIC WIDTH ----------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Section switching functionality
  setupSectionToggling();

  // File input display
  setupFileInputDisplay();

  // Setup dynamic width calculation for all inputs
  setupDynamicInputWidths();

  // Setup checkbox handling
  setupCheckboxes();

  // Initialize widths for visible section
  updateVisibleSectionInputWidths();
});

// Section toggling functionality
function setupSectionToggling() {
  const importButton = document.getElementById("importButton");
  const templateButton = document.getElementById("templateButton");
  const importSection = document.getElementById("importSection");
  const templateSection = document.getElementById("templateSection");

  if (importButton && templateButton && importSection && templateSection) {
    importButton.addEventListener("click", () => {
      importSection.style.display = "block";
      templateSection.style.display = "none";
      importButton.classList.add("active");
      templateButton.classList.remove("active");
      updateVisibleSectionInputWidths();
    });

    templateButton.addEventListener("click", () => {
      importSection.style.display = "none";
      templateSection.style.display = "block";
      importButton.classList.remove("active");
      templateButton.classList.add("active");
      updateVisibleSectionInputWidths();
    });
  }
}

// Handle file input display
function setupFileInputDisplay() {
  const fileInput = document.getElementById("fileInput");
  const fileNameDisplay = document.querySelector(".file-name-display");
  const placeholderText = "(no file selected)";

  if (fileInput && fileNameDisplay) {
    fileNameDisplay.textContent = placeholderText;

    fileInput.addEventListener("change", function () {
      if (this.files && this.files.length > 0) {
        const fileName = this.files[0].name;
        fileNameDisplay.textContent = `(${fileName})`;
      } else {
        fileNameDisplay.textContent = placeholderText;
      }
    });
  }
}

// Setup dynamic width calculation for all inputs
function setupDynamicInputWidths() {
  // Find all inputs that need dynamic width
  const dynamicWidthInputs = document.querySelectorAll(
    "input.text-input[data-helper-id]"
  );

  dynamicWidthInputs.forEach((input) => {
    // Initial width adjustment
    updateInputWidth(input);

    // Add event listeners for text changes
    input.addEventListener("input", () => updateInputWidth(input));
    input.addEventListener("change", () => updateInputWidth(input));
    input.addEventListener("focus", () => updateInputWidth(input));
    input.addEventListener("blur", () => updateInputWidth(input));

    // Special handling for the number input
    if (input.id === "templateCardCount") {
      // Ensure only numbers are entered if it's the number input
      input.addEventListener("keypress", (e) => {
        if (
          !/[0-9]/.test(e.key) &&
          e.key !== "Backspace" &&
          e.key !== "Delete" &&
          e.key !== "ArrowLeft" &&
          e.key !== "ArrowRight"
        ) {
          e.preventDefault();
        }
      });

      // Enforce min/max values on blur
      input.addEventListener("blur", () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val)) {
          const min = parseInt(input.getAttribute("min") || "1", 10);
          const max = parseInt(input.getAttribute("max") || "500", 10);

          if (val < min) input.value = min;
          if (val > max) input.value = max;
        }
        updateInputWidth(input);
      });
    }
  });
}

// Setup checkbox handling
function setupCheckboxes() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');

  checkboxes.forEach((checkbox) => {
    const label = checkbox.nextElementSibling;

    checkbox.addEventListener("change", function () {
      if (this.checked) {
        label.classList.add("checked");
      } else {
        label.classList.remove("checked");
      }
    });
  });
}

// Function to update input width based on content
function updateInputWidth(input) {
  if (!input) return;

  // Get the helper span ID from data attribute
  const helperId = input.getAttribute("data-helper-id");
  if (!helperId) return;

  const helperSpan = document.getElementById(helperId);
  if (!helperSpan) return;

  // Get the text to measure (value or placeholder)
  const textToMeasure = input.value || input.placeholder || "";

  // Reset the helper span to ensure clean measurement
  helperSpan.style.all = "initial";
  helperSpan.style.position = "absolute";
  helperSpan.style.visibility = "hidden";
  helperSpan.style.whiteSpace = "pre";
  helperSpan.style.display = "inline-block";

  // Clone input font styles to helper span for accurate measurement
  const inputStyle = window.getComputedStyle(input);
  helperSpan.style.fontFamily = inputStyle.fontFamily;
  helperSpan.style.fontSize = inputStyle.fontSize;
  helperSpan.style.fontWeight = inputStyle.fontWeight;
  helperSpan.style.letterSpacing = inputStyle.letterSpacing;
  helperSpan.style.textTransform = inputStyle.textTransform;

  // Set content to measure
  helperSpan.textContent = textToMeasure;

  // Get exact text width using getBoundingClientRect() for pixel-perfect measurement
  const textWidth = Math.ceil(helperSpan.getBoundingClientRect().width);

  // Set the input width to exactly match the text
  // We'll add just the minimum required horizontal padding that exists in the CSS
  const horizontalPadding =
    parseFloat(inputStyle.paddingLeft) + parseFloat(inputStyle.paddingRight);

  // Calculate final width with zero buffer
  const finalWidth = textWidth;

  // Set the input width
  input.style.width = `${finalWidth}px`;

  // Debug output if needed
  // console.log(`Input ${input.id} width: ${finalWidth}px for text "${textToMeasure}"`);
}

// Update widths for all inputs in the currently visible section
function updateVisibleSectionInputWidths() {
  const importSection = document.getElementById("importSection");
  const templateSection = document.getElementById("templateSection");

  if (
    importSection &&
    window.getComputedStyle(importSection).display !== "none"
  ) {
    const visibleInputs = importSection.querySelectorAll(
      "input.text-input[data-helper-id]"
    );
    visibleInputs.forEach((input) => updateInputWidth(input));
  } else if (
    templateSection &&
    window.getComputedStyle(templateSection).display !== "none"
  ) {
    const visibleInputs = templateSection.querySelectorAll(
      "input.text-input[data-helper-id]"
    );
    visibleInputs.forEach((input) => updateInputWidth(input));
  }
}

///------------------------------ CHECKBOXES ----------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Select all checkboxes that need this behavior
  const checkboxes = document.querySelectorAll(
    'label.cursor-pointer input[type="checkbox"].hidden'
  );

  checkboxes.forEach((checkbox) => {
    // Find the corresponding span within the same label
    // Using parentElement.querySelector is generally reliable here
    const span = checkbox.parentElement.querySelector("span.checkbox");

    if (span) {
      // Add event listener for changes on the checkbox
      checkbox.addEventListener("change", function () {
        // Toggle the 'checked' class on the span based on checkbox state
        // 'this.checked' refers to the checked property of the checkbox
        span.classList.toggle("checked", this.checked);
      });

      // Initial check in case the checkbox is pre-checked on page load
      // Ensure the span's class matches the initial checkbox state
      span.classList.toggle("checked", checkbox.checked);
    } else {
      console.warn("Could not find span for checkbox:", checkbox.id);
    }
  });
});
