/////////////////////////////////////////////////////////////////////////////////////
/////////                    GLOBAL HELPERS FOR WHITE BALANCE               /////////
/////////////////////////////////////////////////////////////////////////////////////

// Check if a layer exists by name in the current active document
function layerExistsByName(name) {
    return Boolean(app.activeDocument?.layers?.some(layer => layer.name === name));
}

// Global helper: runBatchPlay
async function runBatchPlay(commandObj, options = { dialogOptions: "dontDisplay" }) {
    return await batchPlay([{
        ...commandObj,
        _options: options
    }], {});
}

// Get the temperature value from the "White Balance" layer
async function get_temp_value() {
    const result = await runBatchPlay({
        _obj: "get",
        _target: [
            { _ref: "layer", _name: "White Balance" },
            { _ref: "document", _enum: "ordinal", _value: "targetEnum" }
        ]
    });
    return result[0].smartObject.filterFX[0].filter.$Temp;
}

// Get the tint value from the "White Balance" layer
async function get_tint_value() {
    const result2 = await runBatchPlay({
        _obj: "get",
        _target: [
            { _ref: "layer", _name: "White Balance" },
            { _ref: "document", _enum: "ordinal", _value: "targetEnum" }
        ]
    });
    return result2[0].smartObject.filterFX[0].filter.$Tint;
}

// Update the temp and tint sliders from the current White Balance layer
async function updateSlidersFromWB() {
    tempSlider.value = await get_temp_value();
    tintSlider.value = await get_tint_value();
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                           GLOBAL CONSTS                           /////////
/////////////////////////////////////////////////////////////////////////////////////
const app = require("photoshop").app;
const batchPlay = require("photoshop").action.batchPlay;
const core = require("photoshop").core;
const PhotoshopCore = require('photoshop').core;
// const doc = app.activeDocument;
const ExecuteAsModal = require("photoshop").core.executeAsModal;


const tempSlider = document.querySelector("#tempSlider");
const tintSlider = document.querySelector("#tintSlider");
const wbModeLabel = document.querySelector("#wbmode");
const autoSwitch = document.querySelector("#wbAutoSwitch");

let wasAutoWB = false; // Tracks previous state

// Utility: debounce
function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}


document.addEventListener("DOMContentLoaded", () => {

// --- Canvas Placement: Enable/Disable canvasBgColor and canvasMargin ---

function updateCanvasOptionsState() {
    const placementGroup = document.getElementById("canvasPlacement");
    const bgColorGroup = document.getElementById("canvasBgColor");
    const marginGroup = document.getElementById("canvasMargin");

    // Find checked radio in placement group
    const checkedPlacement = placementGroup.querySelector('sp-radio[checked]') ||
        Array.from(placementGroup.querySelectorAll('sp-radio')).find(r => r.checked);

    const isFit = checkedPlacement && checkedPlacement.value === "fit";

    // Helper to enable/disable all radios in a group
    function setRadioGroupDisabled(group, disabled) {
        group.querySelectorAll('sp-radio').forEach(radio => {
            radio.disabled = disabled;
        });
    }

    setRadioGroupDisabled(bgColorGroup, !isFit);
    setRadioGroupDisabled(marginGroup, !isFit);
}

// Initial state on load
updateCanvasOptionsState();

// Listen for changes on canvasPlacement
document.getElementById("canvasPlacement").addEventListener("change", updateCanvasOptionsState);

/////////////////////////////////////////////////////////////////////////////////////
/////////                             LISTENER                              /////////
/////////////////////////////////////////////////////////////////////////////////////


function disableAutoWBUI() {
    autoSwitch.checked = false;
    setWbMode("manual");
    tempSlider.value = 0;
    tintSlider.value = 0;
    wasAutoWB = false;
    console.log("[WB] 'White Balance' layer was removed — Auto WB disabled.");
}


function resetWBUI() {
    // Always reset sliders
    tempSlider.value = 0;
    tintSlider.value = 0;

    // If Auto WB was on, turn it off
    if (autoSwitch.checked) {
        autoSwitch.checked = false;
        wasAutoWB = false;
    }

    // Always enable manual mode
    setWbMode("manual");

    console.log("[WB] 'White Balance' layer was removed or doc closed — UI reset.");
}

// -------- layers flattening  / merge down / merge visible listener --------- //


require('photoshop').action.addNotificationListener([{
    event: "historyStateChanged"
}], (event, desc) => {
    const cosiek = require("photoshop").core.translateUIString("$$$/Commands/flattenimage=Flatten Image");
    const cosiek2 = require("photoshop").core.translateUIString("$$$/Commands/mergeLayerNew=Merge Down");
    const cosiek3 = require("photoshop").core.translateUIString("$$$/Commands/mergeVisible=Merge Visible");

    if (desc.name === cosiek || desc.name === cosiek2 || desc.name === cosiek3) {
        const existsWB = layerExistsByName("White Balance");
        if (existsWB === false) {
            resetWBUI();
        }
    }
});



// -------- layer delete listener -------- //

require('photoshop').action.addNotificationListener([{
    event: "delete"
}], (event, desc) => {
    if (desc._target?.[0]?._ref === "layer") {
        const existsWB = layerExistsByName("White Balance");
        if (existsWB === false) {
            resetWBUI();
        }
    }
});

// -------- main listener -------- //

var listener = () => {
    // Check if a document is open at all
    if (!app.documents.length || !app.activeDocument) {
        resetWBUI(); // Reset UI because there's no document
        return; // Exit early to prevent accessing undefined doc
    }

    const existsWB = layerExistsByName("White Balance");

    if (!existsWB) {
        resetWBUI();
    }

    if (existsWB) {
        updateSlidersFromWB();
    }
}

require('photoshop').action.addNotificationListener([{
        event: "select"
    },
    {
        event: "open"
    },
    {
        event: "close"
    }
    // any other events...
], listener);

// -------- panel open listener -------- //

document.addEventListener('uxpcommand', (event) => {
    const { commandId } = event;
    if (commandId === 'uxpshowpanel') {
        const existsWB = layerExistsByName("White Balance");
        if (existsWB === false) {
            resetWBUI();
        }
        if (existsWB === true) {
            updateSlidersFromWB();
        }
    }
});


// -------- Auto WB listener -------- //


const handleAutoWBChange = debounce(async (e) => {
    const autoSwitch = e.target;

    if (!app.documents.length) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first.' });
        autoSwitch.checked = false;
        setWbMode("manual");
        return;
    }

    if (autoSwitch.checked) {
        await applyAutoWhiteBalance();
        setWbMode("auto");
        wasAutoWB = true;
    } else {
        if (wasAutoWB) {
            await resetwb();
        }
        setWbMode("manual");
        wasAutoWB = false;
    }
}, 300);

document.querySelector("#wbAutoSwitch").addEventListener("change", handleAutoWBChange);

function setWbMode(mode) {
    if (mode === "auto") {
        wbModeLabel.textContent = "Auto White Balance Applied";
        tempSlider.disabled = true;
        tintSlider.disabled = true;
    } else {
        wbModeLabel.textContent = "Manual White Balance";
        tempSlider.disabled = false;
        tintSlider.disabled = false;
    }
}
// -------- reset WB listener -------- //

document.getElementById("btnresetwb").addEventListener("click", async () => {
    await resetwb();

    // Force toggle OFF and restore manual mode
    const toggle = document.querySelector("#wbAutoSwitch");
    toggle.checked = false;
    setWbMode("manual");
});

/////////////////////////////////////////////////////////////////////////////////////
/////////           HELPER FUNCTION - MODAL & SUSPEND HISTORY               /////////
/////////////////////////////////////////////////////////////////////////////////////

async function suspendHistory(fn, historyName = "(Plugin command)", commandName = "Waiting for plugin command...") {
    async function executeAsModal(executionContext) {
      const hostControl = executionContext.hostControl;
      const suspensionID = await hostControl.suspendHistory({
          "historyStateInfo": {
              "name": historyName,
              "target": { _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' }
          }
      });
      try {
        await fn(executionContext);  
      } catch(e) {console.error(e)}
     await hostControl.resumeHistory(suspensionID);
    }
    await require("photoshop").core.executeAsModal(executeAsModal, {commandName});
  }

/////////////////////////////////////////////////////////////////////////////////////
/////////                               TABS                                /////////
/////////////////////////////////////////////////////////////////////////////////////

Array.from(document.querySelectorAll(".sp-tab")).forEach(theTab => {
    theTab.onclick = () => {
        localStorage.setItem("currentTab", theTab.getAttribute("id"));
        Array.from(document.querySelectorAll(".sp-tab")).forEach(aTab => {
            if (aTab.getAttribute("id") === theTab.getAttribute("id")) {
                aTab.classList.add("selected");
            } else {
                aTab.classList.remove("selected");
            }
        });
        Array.from(document.querySelectorAll(".sp-tab-page")).forEach(tabPage => {
            if (tabPage.getAttribute("id").startsWith(theTab.getAttribute("id"))) {
                tabPage.classList.add("visible");
            } else {
                tabPage.classList.remove("visible");
            }
        });
    }
});

/////////////////////////////////////////////////////////////////////////////////////
/////////                             FILTERS                               /////////
/////////////////////////////////////////////////////////////////////////////////////


const filterMap = {
    modern1: filter_modern1,
    modern2: filter_modern2,
    modern3: filter_modern3,
    modern4: filter_modern4,
    modern5: filter_modern5,
    modern6: filter_modern6,
    modern7: filter_modern7,
    modern8: filter_modern8,
    modern9: filter_modern9,
    modern10: filter_modern10,
    sunglow: filter_sunglow,
    sunnylook: filter_sunnylook,
    glamtone: filter_glamtone,
    vintage1: filter_vintage1,
    vintage2: filter_vintage2,
    vintage3: filter_vintage3,
    vintage4: filter_vintage4,
    vintage5: filter_vintage5,
    vintage6: filter_vintage6,
    vintage7: filter_vintage7,
    vintage8: filter_vintage8,
    vintage9: filter_vintage9,
    vintage10: filter_vintage10,
    bw1: filter_bw1,
    bw2: filter_bw2,
    bw3: filter_bw3,
    bw4: filter_bw4,
    bw5: filter_bw5,
    bw6: filter_bw6,
    bw7: filter_bw7,
    bw8: filter_bw8,
    grainsmall: filter_grainsmall,
    grainmedium: filter_grainmedium,
    grainlarge: filter_grainlarge,
    grainextralarge: filter_grainextralarge,
    vignetting: filter_vignetting,
};

document.querySelector("#filters").addEventListener("change", evt => {
    const selected = document.querySelector("#filters").value;
    if (filterMap[selected]) {
        filterMap[selected]();
        document.getElementById("def").selected = true;
    }
});

/////////////////////////////////////////////////////////////////////////////////////
/////////                           CAMERA RAW                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function CameraRaw() {
    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
    if (exists === true) {
        await core.executeAsModal(() => {
            batchPlay(
                [{
                    _obj: "Adobe Camera Raw Filter",
                    _options: {
                        dialogOptions: "display"
                    }
                }], {
                });
        })   
    }
    else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
document.getElementById("btnCameraRaw").addEventListener("click", CameraRaw);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           IMAGE SIZE                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function showImageSizeDialog() {
    const docexists = () => Boolean(app.documents?.length);
    const exists = docexists();

    if (exists === true) {
        await core.executeAsModal(() => {
            batchPlay(
                [{
                    _obj: "imageSize",
                    scaleStyles: true,
                    constrainProportions: true,
                    interfaceIconFrameDimmed: {
                       _enum: "interpolationType",
                       _value: "automaticInterpolation"
                    },
                    _options: {
                        dialogOptions: "display"
                    }
                }],
                {}
            );
        });
    } else {
        PhotoshopCore.showAlert({ message: "📄 Open an image first" });
    }
}

document.getElementById("btnImageSize").addEventListener("click", showImageSizeDialog);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          NEURAL FILTERS                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function neural() {

    const docexists = () => {return Boolean(app.documents?.length)}  
    const exists = docexists()
         
if (exists === true) {

    await core.executeAsModal(() => {

       batchPlay(
            [{
                _obj: 'neuralGalleryFilters',
                _options: {
                    dialogOptions: "display"
                }
            }], {

            });
        })   

}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}

}
document.getElementById("btnneural").addEventListener("click", neural);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            EXPOSURE                                /////////
/////////////////////////////////////////////////////////////////////////////////////

async function expplus() {
    if (!app.documents.length) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
        return;
    }

    await suspendHistory(async () => {
        await batchPlay([{
            _obj: "Adobe Camera Raw Filter",
            $Ex12: 0.2,  // Correct top-level key
            _options: { dialogOptions: "dontDisplay" }
        }], {});
    }, "Exposure +");
}
document.getElementById("btnexpplus").addEventListener("click", expplus);

async function expminus() {
    if (!app.documents.length) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
        return;
    }

    await suspendHistory(async () => {
        await batchPlay([{
            _obj: "Adobe Camera Raw Filter",
            $Ex12: -0.2,  // Correct top-level key
            _options: { dialogOptions: "dontDisplay" }
        }], {});
    }, "Exposure -");
}
document.getElementById("btnexpminus").addEventListener("click", expminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            CONTRAST                                /////////
/////////////////////////////////////////////////////////////////////////////////////

async function conplus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Cr12: 10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Contrast +");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnconplus").addEventListener("click", conplus);

async function conminus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Cr12: -10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Contrast -");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnconminus").addEventListener("click", conminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            HIGHLIGHTS                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function hiliplus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Hi12: 10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Highlights +");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnhiliplus").addEventListener("click", hiliplus);

async function hiliminus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Hi12: -10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Highlights -");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnhiliminus").addEventListener("click", hiliminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            SHADOWS                                 /////////
/////////////////////////////////////////////////////////////////////////////////////

async function shadplus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Sh12: 10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Shadows +");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnshadplus").addEventListener("click", shadplus);

async function shadminus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Sh12: -10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Shadows -");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnshadminus").addEventListener("click", shadminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            WHITES                                   ////////
/////////////////////////////////////////////////////////////////////////////////////

async function whipplus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Wh12: 10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Whites +");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnwhipplus").addEventListener("click", whipplus);

async function whipminus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Wh12: -10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Whites -");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnwhipminus").addEventListener("click", whipminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            BLACKS                                   ////////
/////////////////////////////////////////////////////////////////////////////////////

async function blaplus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Bk12: 10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Blacks +");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnblaplus").addEventListener("click", blaplus);

async function blaminus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ _obj: "Adobe Camera Raw Filter", $Bk12: -10, _options: { dialogOptions: "dontDisplay" }}], {});
        }, "Blacks -");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnblaminus").addEventListener("click", blaminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           VIBRANCE                                  ////////
/////////////////////////////////////////////////////////////////////////////////////

async function vibplus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ 
                _obj: "Adobe Camera Raw Filter", 
                $Vibrance: 10, 
                _options: { dialogOptions: "dontDisplay" } 
            }], {});
        }, "Vibrance +");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnvibplus").addEventListener("click", vibplus);

async function vibminus() {
    if (app.documents.length) {
        suspendHistory(async () => {
            batchPlay([{ 
                _obj: "Adobe Camera Raw Filter", 
                $Vibrance: -10, 
                _options: { dialogOptions: "dontDisplay" } 
            }], {});
        }, "Vibrance -");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}
document.getElementById("btnvibminus").addEventListener("click", vibminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           SATURATION                                ////////
/////////////////////////////////////////////////////////////////////////////////////

async function satplus() {
    if (!app.documents.length) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
        return;
    }

    await suspendHistory(async () => {
        await batchPlay([{
            _obj: "Adobe Camera Raw Filter",
            saturation: 10, // ✔ top-level, no `$`, no nesting
            _options: { dialogOptions: "dontDisplay" }
        }], {});
    }, "Saturation +");
}
document.getElementById("btnsatplus").addEventListener("click", satplus);

async function satminus() {
    if (!app.documents.length) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
        return;
    }

    await suspendHistory(async () => {
        await batchPlay([{
            _obj: "Adobe Camera Raw Filter",
            saturation: -10, // ✔ direct assignment
            _options: { dialogOptions: "dontDisplay" }
        }], {});
    }, "Saturation -");
}
document.getElementById("btnsatminus").addEventListener("click", satminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 1                           /////////
/////////////////////////////////////////////////////////////////////////////////////


async function filter_modern1() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 1"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [ 
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 01\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"66BF3A2945B87CE16A1DC36B94F5C65E\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:Shadows2012=\"+25\"\n      crs:Clarity2012=\"+10\"\n      crs:ConvertToGrayscale=\"False\"\n      crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>65, 47</rdf:li>\n       <rdf:li>192, 222</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 01",
                    $LokU: "66BF3A2945B87CE16A1DC36B94F5C65E",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Modern 1")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 2                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern2() {

    const docexists = () => {return Boolean(app.documents?.length)}
      const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 2"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [

                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",

                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 02\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"88DC6C1939F646FBA7F3216B9CC5948C\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"01FE8C9326A018498B6E3DC8EB5535B6\"\n     crs:RGBTableAmount=\"0.75\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 02",
                    $LokU: "88DC6C1939F646FBA7F3216B9CC5948C",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Modern 2")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 3                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern3() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 3"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 03\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"78778F200B90D1ADA79F928385AD9114\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:Highlights2012=\"-8\"\n      crs:Shadows2012=\"+4\"\n      crs:Clarity2012=\"+4\"\n      crs:Saturation=\"-20\"\n      crs:SaturationAdjustmentOrange=\"-14\"\n      crs:LuminanceAdjustmentOrange=\"-7\"\n      crs:SplitToningShadowHue=\"44\"\n      crs:SplitToningShadowSaturation=\"25\"\n      crs:SplitToningHighlightHue=\"0\"\n      crs:SplitToningHighlightSaturation=\"0\"\n      crs:SplitToningBalance=\"0\"\n      crs:ColorGradeMidtoneHue=\"0\"\n      crs:ColorGradeMidtoneSat=\"0\"\n      crs:ColorGradeShadowLum=\"0\"\n      crs:ColorGradeMidtoneLum=\"0\"\n      crs:ColorGradeHighlightLum=\"0\"\n      crs:ColorGradeBlending=\"100\"\n      crs:ColorGradeGlobalHue=\"0\"\n      crs:ColorGradeGlobalSat=\"0\"\n      crs:ColorGradeGlobalLum=\"0\"\n      crs:PostCropVignetteAmount=\"-8\"\n      crs:PostCropVignetteMidpoint=\"50\"\n      crs:PostCropVignetteFeather=\"50\"\n      crs:PostCropVignetteRoundness=\"0\"\n      crs:PostCropVignetteStyle=\"1\"\n      crs:PostCropVignetteHighlightContrast=\"0\"\n      crs:ConvertToGrayscale=\"False\"\n      crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>32, 22</rdf:li>\n       <rdf:li>64, 56</rdf:li>\n       <rdf:li>128, 128</rdf:li>\n       <rdf:li>192, 196</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 03",
                    $LokU: "78778F200B90D1ADA79F928385AD9114",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Filter - Modern 3")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 4                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern4() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 4"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 04\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"D991E97D3C94E5D2B74B29FF36280000\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:Exposure2012=\"+0.20\"\n     crs:Contrast2012=\"+15\"\n     crs:Shadows2012=\"+21\"\n     crs:Clarity2012=\"+5\"\n     crs:ParametricShadows=\"0\"\n     crs:ParametricDarks=\"-9\"\n     crs:ParametricLights=\"0\"\n     crs:ParametricHighlights=\"0\"\n     crs:ParametricShadowSplit=\"25\"\n     crs:ParametricMidtoneSplit=\"50\"\n     crs:ParametricHighlightSplit=\"75\"\n     crs:SaturationAdjustmentOrange=\"-10\"\n     crs:SplitToningShadowHue=\"215\"\n     crs:SplitToningShadowSaturation=\"10\"\n     crs:SplitToningHighlightHue=\"0\"\n     crs:SplitToningHighlightSaturation=\"0\"\n     crs:SplitToningBalance=\"0\"\n     crs:ColorGradeMidtoneHue=\"0\"\n     crs:ColorGradeMidtoneSat=\"0\"\n     crs:ColorGradeShadowLum=\"0\"\n     crs:ColorGradeMidtoneLum=\"0\"\n     crs:ColorGradeHighlightLum=\"0\"\n     crs:ColorGradeBlending=\"100\"\n     crs:ColorGradeGlobalHue=\"0\"\n     crs:ColorGradeGlobalSat=\"0\"\n     crs:ColorGradeGlobalLum=\"0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 04",
                    $LokU: "D991E97D3C94E5D2B74B29FF36280000",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }




            ], {});
    }, "Filter - MOdern 4")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 5                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern5() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 5"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 05\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"B1D5466E60385BC8CE464AB1607A6332\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"3D5DCD93FD15FE15FA4E65432ED809BB\"\n     crs:RGBTableAmount=\"0.75\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 05",
                    $LokU: "B1D5466E60385BC8CE464AB1607A6332",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Modern 5")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 6                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern6() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 6"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 06\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"D07E8E7D2E11AE59D4E7A3FCE9DE41EA\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"AE4BEAA9E0477C9F0DFABEDD7B4D558A\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 06",
                    $LokU: "D07E8E7D2E11AE59D4E7A3FCE9DE41EA",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Modern 6")

}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 7                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern7() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 7"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 07\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"7B79093CEC7726D67B352CAD78D1601F\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"D0A626800FCD9BB00251BD0BB83F5AB8\"\n     crs:RGBTableAmount=\"0.75\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 07",
                    $LokU: "7B79093CEC7726D67B352CAD78D1601F",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Filter - Modern 7")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 8                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern8() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 8"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 08\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"DA1C3775662D6B6A75F8BC2CEEB3724A\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"6133E9CB13FA32712A5AC579D110EC44\"\n     crs:RGBTableAmount=\"0.75\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 08",
                    $LokU: "DA1C3775662D6B6A75F8BC2CEEB3724A",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Modern 8")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 9                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern9() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 9"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 09\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"71F7192EA6E8554BD36C9F27977D0A8C\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"E3A62FE4DB2F7FF35CC3A8F2FE9184E3\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 09",
                    $LokU: "71F7192EA6E8554BD36C9F27977D0A8C",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Modern 9")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER MODERN 10                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_modern10() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Modern 10"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Modern 10\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"0682C30D08BCAEE35E8B7643AFAF64C1\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Modern</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"92C15ED8435601CACD2E0A020A6EB83E\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Modern 10",
                    $LokU: "0682C30D08BCAEE35E8B7643AFAF64C1",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Filter - Modern 10")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 1                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage1() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 1"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 01\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"97291D549FC232787BDFD3353151BB62\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"D133EC539BB44CE73B8890C50B8D9F9E\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 01",
                    $LokU: "97291D549FC232787BDFD3353151BB62",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Filter - Vintage 1")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 2                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage2() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 2"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 02\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"36472F1ECEE82F4A68A38A1A63AE40FD\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"072D5808C8D1BD682C0FAFC048B57AAB\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 02",
                    $LokU: "36472F1ECEE82F4A68A38A1A63AE40FD",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vintage 2")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 3                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage3() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 3"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 03\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"C2C9D9EE5A2DBCDE2D50819666A61BB0\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"73D8B710262B535E07ACDC3DC211DBCA\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 03",
                    $LokU: "C2C9D9EE5A2DBCDE2D50819666A61BB0",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Vintage 3")

}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 4                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage4() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 4"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 04\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"67EE4520503B68AD5670945761D32A1C\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"02F2138F2C1F8B0800EAB2A94275FA97\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 04",
                    $LokU: "67EE4520503B68AD5670945761D32A1C",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vintage 4")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 5                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage5() {

    const docexists = () => {return Boolean(app.documents?.length)}
      const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 5"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 05\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"981DC8FD2235C2B65650A5C012819B3E\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"CD5866E43AEB3C8ABF5026DF0AAF0B5B\"\n     crs:RGBTableAmount=\"0.75\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 05",
                    $LokU: "981DC8FD2235C2B65650A5C012819B3E",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vintage 5")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 6                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage6() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 6"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 06\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"53EDA964850322DB5C12DBBC27965701\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:ConvertToGrayscale=\"False\"\n      crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n      crs:RGBTable=\"D133EC539BB44CE73B8890C50B8D9F9E\"\n      crs:RGBTableAmount=\"0.5\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 29</rdf:li>\n       <rdf:li>50, 56</rdf:li>\n       <rdf:li>123, 136</rdf:li>\n       <rdf:li>184, 194</rdf:li>\n       <rdf:li>255, 233</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 06",
                    $LokU: "53EDA964850322DB5C12DBBC27965701",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vintage 6")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 7                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage7() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 7"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 07\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"63F2FAD3735914AD303E181207F4D5E3\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:ParametricShadows=\"0\"\n      crs:ParametricDarks=\"0\"\n      crs:ParametricLights=\"-20\"\n      crs:ParametricHighlights=\"-33\"\n      crs:ParametricShadowSplit=\"25\"\n      crs:ParametricMidtoneSplit=\"50\"\n      crs:ParametricHighlightSplit=\"75\"\n      crs:SaturationAdjustmentBlue=\"-29\"\n      crs:SplitToningShadowHue=\"186\"\n      crs:SplitToningShadowSaturation=\"8\"\n      crs:SplitToningHighlightHue=\"59\"\n      crs:SplitToningHighlightSaturation=\"13\"\n      crs:SplitToningBalance=\"+38\"\n      crs:ColorGradeMidtoneHue=\"0\"\n      crs:ColorGradeMidtoneSat=\"0\"\n      crs:ColorGradeShadowLum=\"0\"\n      crs:ColorGradeMidtoneLum=\"0\"\n      crs:ColorGradeHighlightLum=\"0\"\n      crs:ColorGradeBlending=\"100\"\n      crs:ColorGradeGlobalHue=\"0\"\n      crs:ColorGradeGlobalSat=\"0\"\n      crs:ColorGradeGlobalLum=\"0\"\n      crs:ConvertToGrayscale=\"False\"\n      crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n      crs:RGBTable=\"D133EC539BB44CE73B8890C50B8D9F9E\"\n      crs:RGBTableAmount=\"0.5\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 29</rdf:li>\n       <rdf:li>50, 56</rdf:li>\n       <rdf:li>123, 136</rdf:li>\n       <rdf:li>184, 194</rdf:li>\n       <rdf:li>255, 233</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>119, 121</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>120, 120</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 07",
                    $LokU: "63F2FAD3735914AD303E181207F4D5E3",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vintage 7")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 8                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage8() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 8"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 08\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"8AC303446BAD50DBAE693845AEAFD3B2\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"09D1205B0E6C1CB5BAD4DC92239622BF\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 08",
                    $LokU: "8AC303446BAD50DBAE693845AEAFD3B2",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Vintage 8")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 9                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage9() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 9"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 09\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"EB1AC61A0F406E240637ACFFBE1D2C55\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"B0502FB2AE5B394300F8F33771AA386E\"\n     crs:RGBTableAmount=\"0.5\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 09",
                    $LokU: "EB1AC61A0F406E240637ACFFBE1D2C55",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vintage 9")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER VINTAGE 10                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vintage10() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Vintage 10"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"Vintage 10\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"AE851798974C4DAA040845432D56E13C\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">Vintage</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:ConvertToGrayscale=\"False\"\n     crs:LookTable=\"E1095149FDB39D7A057BAB208837E2E1\"\n     crs:RGBTable=\"E7797C1E60CA913A25C91DE4B9547237\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "Vintage 10",
                    $LokU: "AE851798974C4DAA040845432D56E13C",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vintage 10")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 1                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw1() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Black & White 1"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"B&amp;W 01\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"484F0802EF53449FBAC5858BC9D17B5E\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:SortName>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W 01</rdf:li>\n     </rdf:Alt>\n    </crs:SortName>\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:Contrast2012=\"+33\"\n      crs:Highlights2012=\"-40\"\n      crs:Shadows2012=\"+45\"\n      crs:Blacks2012=\"-10\"\n      crs:Clarity2012=\"+8\"\n      crs:ConvertToGrayscale=\"True\"\n      crs:LookTable=\"62CE423BDCA099FE0B786CA01EB606B0\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>17, 17</rdf:li>\n       <rdf:li>34, 36</rdf:li>\n       <rdf:li>51, 55</rdf:li>\n       <rdf:li>68, 75</rdf:li>\n       <rdf:li>85, 96</rdf:li>\n       <rdf:li>102, 116</rdf:li>\n       <rdf:li>119, 136</rdf:li>\n       <rdf:li>136, 154</rdf:li>\n       <rdf:li>153, 171</rdf:li>\n       <rdf:li>170, 187</rdf:li>\n       <rdf:li>187, 202</rdf:li>\n       <rdf:li>204, 216</rdf:li>\n       <rdf:li>221, 230</rdf:li>\n       <rdf:li>238, 242</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "B&W 01",
                    $LokU: "484F0802EF53449FBAC5858BC9D17B5E",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "FIlter - Black & White 1")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 2                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw2() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Black & White 2"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"B&amp;W 03\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"ADB81986EAF84E0999C0112BDE1F93D1\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:SortName>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W 03</rdf:li>\n     </rdf:Alt>\n    </crs:SortName>\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:Contrast2012=\"+57\"\n      crs:Clarity2012=\"+8\"\n      crs:ConvertToGrayscale=\"True\"\n      crs:LookTable=\"62CE423BDCA099FE0B786CA01EB606B0\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>29, 25</rdf:li>\n       <rdf:li>128, 128</rdf:li>\n       <rdf:li>192, 196</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "B&W 03",
                    $LokU: "ADB81986EAF84E0999C0112BDE1F93D1",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter - Black & White 2")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 3                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw3() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Black & White 3"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"B&amp;W 05\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"21CCB0C1ADFD41D7807665AD43FBDD7B\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:SortName>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W 05</rdf:li>\n     </rdf:Alt>\n    </crs:SortName>\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:Contrast2012=\"+33\"\n     crs:ConvertToGrayscale=\"True\"\n     crs:LookTable=\"8F92782A907F20072E95A74A9ED7AEAC\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "B&W 05",
                    $LokU: "21CCB0C1ADFD41D7807665AD43FBDD7B",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Black & White 3")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 4                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw4() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Black & White 4"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"B&amp;W 06\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"503E6FD1198A4C268AC074C517FBDBEC\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:SortName>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W 06</rdf:li>\n     </rdf:Alt>\n    </crs:SortName>\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters\n     crs:Version=\"14.1\"\n     crs:ProcessVersion=\"11.0\"\n     crs:Contrast2012=\"+33\"\n     crs:ConvertToGrayscale=\"True\"\n     crs:LookTable=\"5E841F087547190447B0F2CACF3397C1\"/>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "B&W 06",
                    $LokU: "503E6FD1198A4C268AC074C517FBDBEC",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Black & White 4")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 5                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw5() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Black & White 5"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"B&amp;W 10\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"72732CD81196493E80FFA81EF99CE03A\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:SortName>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W 10</rdf:li>\n     </rdf:Alt>\n    </crs:SortName>\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:Contrast2012=\"+8\"\n      crs:Clarity2012=\"+8\"\n      crs:ConvertToGrayscale=\"True\"\n      crs:LookTable=\"AC0E24EFC658D3BD29B430044AE2FB7C\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>64, 75</rdf:li>\n       <rdf:li>192, 175</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "B&W 10",
                    $LokU: "72732CD81196493E80FFA81EF99CE03A",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Black & White 5")

}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 6                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw6() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Black & White 6"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"B&amp;W 11\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"9D1ED025F3DE4C94BC78481AA67B3C89\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:SortName>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W 11</rdf:li>\n     </rdf:Alt>\n    </crs:SortName>\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:Contrast2012=\"+8\"\n      crs:Highlights2012=\"-50\"\n      crs:Shadows2012=\"+20\"\n      crs:Clarity2012=\"+18\"\n      crs:ConvertToGrayscale=\"True\"\n      crs:LookTable=\"62CE423BDCA099FE0B786CA01EB606B0\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 24</rdf:li>\n       <rdf:li>17, 26</rdf:li>\n       <rdf:li>34, 31</rdf:li>\n       <rdf:li>51, 40</rdf:li>\n       <rdf:li>68, 57</rdf:li>\n       <rdf:li>85, 79</rdf:li>\n       <rdf:li>102, 104</rdf:li>\n       <rdf:li>119, 129</rdf:li>\n       <rdf:li>136, 151</rdf:li>\n       <rdf:li>153, 168</rdf:li>\n       <rdf:li>170, 182</rdf:li>\n       <rdf:li>187, 194</rdf:li>\n       <rdf:li>204, 205</rdf:li>\n       <rdf:li>221, 214</rdf:li>\n       <rdf:li>238, 223</rdf:li>\n       <rdf:li>255, 232</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "B&W 11",
                    $LokU: "9D1ED025F3DE4C94BC78481AA67B3C89",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Black & White 6")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 7                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw7() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Filter - Black & White 7"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    Look: "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        \">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\">\n   <crs:Look>\n    <rdf:Description\n     crs:Name=\"B&amp;W 12\"\n     crs:Amount=\"1\"\n     crs:Cluster=\"Adobe\"\n     crs:UUID=\"8FD143CED5B04137ACE4B5A63962293F\"\n     crs:SupportsMonochrome=\"false\"\n     crs:Copyright=\"© 2018 Adobe Systems, Inc.\">\n    <crs:SortName>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W 12</rdf:li>\n     </rdf:Alt>\n    </crs:SortName>\n    <crs:Group>\n     <rdf:Alt>\n      <rdf:li xml:lang=\"x-default\">B&amp;W</rdf:li>\n     </rdf:Alt>\n    </crs:Group>\n    <crs:Parameters>\n     <rdf:Description\n      crs:Version=\"14.1\"\n      crs:ProcessVersion=\"11.0\"\n      crs:Contrast2012=\"+8\"\n      crs:Clarity2012=\"+8\"\n      crs:ConvertToGrayscale=\"True\"\n      crs:LookTable=\"A94B972D88365440AA36CD881A9C6524\">\n     <crs:ToneCurvePV2012>\n      <rdf:Seq>\n       <rdf:li>0, 20</rdf:li>\n       <rdf:li>62, 42</rdf:li>\n       <rdf:li>206, 211</rdf:li>\n       <rdf:li>255, 230</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012>\n     <crs:ToneCurvePV2012Red>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Red>\n     <crs:ToneCurvePV2012Green>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Green>\n     <crs:ToneCurvePV2012Blue>\n      <rdf:Seq>\n       <rdf:li>0, 0</rdf:li>\n       <rdf:li>255, 255</rdf:li>\n      </rdf:Seq>\n     </crs:ToneCurvePV2012Blue>\n     </rdf:Description>\n    </crs:Parameters>\n    </rdf:Description>\n   </crs:Look>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n",
                    $LokN: "B&W 12",
                    $LokU: "8FD143CED5B04137ACE4B5A63962293F",
                    $LokA: 100,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Black & White 7")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                      FILTER BLACK & WHITE 8                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_bw8() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [

                {
                    _obj: "make",
                    _target: {
                        _ref: "document"
                    },
                    using: {
                        _ref: "historyState",
                        _property: "currentHistoryState"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                // {
                //     _obj: "make",
                //     _target: {
                //         _ref: "layer"
                //     },
                //     _options: {
                //         dialogOptions: "dontDisplay"
                //     }
                // },
                // {
                //     _obj: "mergeVisible",
                //     duplicate: true,
                //     _options: {
                //         dialogOptions: "dontDisplay"
                //     }
                // },
                // {
                //     _obj: "flattenImage",
                //     _options: {
                //         dialogOptions: "dontDisplay"
                //     }
                // },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "gradientMapClass",
                            gradient: {
                                _obj: "gradientClassEvent",
                                name: "Foreground to Background",
                                gradientForm: {
                                    _enum: "gradientForm",
                                    _value: "customStops"
                                },
                                interfaceIconFrameDimmed: 4096,
                                colors: [{
                                        _obj: "colorStop",
                                        color: {
                                            _obj: "RGBColor",
                                            red: 255,
                                            green: 255,
                                            blue: 255
                                        },
                                        type: {
                                            _enum: "colorStopType",
                                            _value: "userStop"
                                        },
                                        location: 0,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "colorStop",
                                        color: {
                                            _obj: "RGBColor",
                                            red: 0,
                                            green: 0,
                                            blue: 0
                                        },
                                        type: {
                                            _enum: "colorStopType",
                                            _value: "userStop"
                                        },
                                        location: 4096,
                                        midpoint: 50
                                    }
                                ],
                                transparency: [{
                                        _obj: "transferSpec",
                                        opacity: {
                                            _unit: "percentUnit",
                                            _value: 100
                                        },
                                        location: 0,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "transferSpec",
                                        opacity: {
                                            _unit: "percentUnit",
                                            _value: 100
                                        },
                                        location: 4096,
                                        midpoint: 50
                                    }
                                ]
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "gradientMapClass",
                        gradient: {
                            _obj: "gradientClassEvent",
                            name: "Custom",
                            gradientForm: {
                                _enum: "gradientForm",
                                _value: "customStops"
                            },
                            interfaceIconFrameDimmed: 4096,
                            colors: [{
                                    _obj: "colorStop",
                                    color: {
                                        _obj: "RGBColor",
                                        red: 0,
                                        green: 0.0013571717181548593,
                                        blue: 0.05701284950191621
                                    },
                                    type: {
                                        _enum: "colorStopType",
                                        _value: "userStop"
                                    },
                                    location: 0,
                                    midpoint: 50
                                },
                                {
                                    _obj: "colorStop",
                                    color: {
                                        _obj: "RGBColor",
                                        red: 250.00000029802322,
                                        green: 248.67315709590912,
                                        blue: 245.09727537631989
                                    },
                                    type: {
                                        _enum: "colorStopType",
                                        _value: "userStop"
                                    },
                                    location: 4096,
                                    midpoint: 50
                                }
                            ],
                            transparency: [{
                                    _obj: "transferSpec",
                                    opacity: {
                                        _unit: "percentUnit",
                                        _value: 100
                                    },
                                    location: 0,
                                    midpoint: 50
                                },
                                {
                                    _obj: "transferSpec",
                                    opacity: {
                                        _unit: "percentUnit",
                                        _value: 100
                                    },
                                    location: 4096,
                                    midpoint: 50
                                }
                            ]
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Background"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Gradient Map 1"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "mergeLayersNew",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp1"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "temp2",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "highPass",
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 15
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "desaturate",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "softLight"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 35
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "temp1"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "temp3",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "adaptCorrect",
                    shadowMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 60
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 60
                        },
                        radius: 100
                    },
                    highlightMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 0
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 50
                        },
                        radius: 30
                    },
                    blackClip: 0.01,
                    whiteClip: 0.01,
                    center: 0,
                    colorCorrection: 20,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "luminosity"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "temp1"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "temp4",
                    version: 2,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "adaptCorrect",
                    shadowMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 0
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 0
                        },
                        radius: 0
                    },
                    highlightMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 75
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 19
                        },
                        radius: 63
                    },
                    blackClip: 0.01,
                    whiteClip: 0.01,
                    center: -10,
                    colorCorrection: 0,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "temp1"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            auto: true
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp5"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 35
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "temp2"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            input: [
                                3,
                                253
                            ],
                            gamma: 0.9
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "screen"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 15
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp6"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "temp7",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "multiply"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 0
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "photoFilter",
                            color: {
                                _obj: "labColor",
                                luminance: 67.06,
                                a: 32,
                                b: 120
                            },
                            density: 25,
                            preserveLuminosity: true
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "photoFilter",
                        color: {
                            _obj: "HSBColorClass",
                            hue: {
                                _unit: "angleUnit",
                                _value: 210.3497314453125
                            },
                            saturation: 100,
                            brightness: 100
                        },
                        density: 30
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp8"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 0
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        adjustment: [{
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "red"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 110,
                                        vertical: 151
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            },
                            {
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "blue"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 151,
                                        vertical: 110
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 7
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp9"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 61,
                                    vertical: 43
                                },
                                {
                                    _obj: "point",
                                    horizontal: 155,
                                    vertical: 190
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 255
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 50
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp10"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            input: [
                                36,
                                255
                            ],
                            gamma: 1.43
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp11"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 20
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "contentLayer"
                    },
                    using: {
                        _obj: "contentLayer",
                        type: {
                            _obj: "gradientLayer",
                            reverse: true,
                            angle: {
                                _unit: "angleUnit",
                                _value: 90
                            },
                            type: {
                                _enum: "gradientType",
                                _value: "radial"
                            },
                            scale: {
                                _unit: "percentUnit",
                                _value: 150
                            },
                            gradient: {
                                _obj: "gradientClassEvent",
                                name: "Custom",
                                gradientForm: {
                                    _enum: "gradientForm",
                                    _value: "customStops"
                                },
                                interfaceIconFrameDimmed: 4096,
                                colors: [{
                                        _obj: "colorStop",
                                        color: {
                                            _obj: "RGBColor",
                                            red: 0,
                                            green: 0,
                                            blue: 0
                                        },
                                        type: {
                                            _enum: "colorStopType",
                                            _value: "userStop"
                                        },
                                        location: 0,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "colorStop",
                                        color: {
                                            _obj: "RGBColor",
                                            red: 255,
                                            green: 255,
                                            blue: 255
                                        },
                                        type: {
                                            _enum: "colorStopType",
                                            _value: "userStop"
                                        },
                                        location: 4096,
                                        midpoint: 50
                                    }
                                ],
                                transparency: [{
                                        _obj: "transferSpec",
                                        opacity: {
                                            _unit: "percentUnit",
                                            _value: 100
                                        },
                                        location: 0,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "transferSpec",
                                        opacity: {
                                            _unit: "percentUnit",
                                            _value: 0
                                        },
                                        location: 2671,
                                        midpoint: 50
                                    }
                                ]
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "softLight"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 15
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "temp12"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "temp12"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "temp5"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "temp1"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelection"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "mergeVisible",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "channel",
                        _property: "selection"
                    },
                    to: {
                        _enum: "ordinal",
                        _value: "allEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "copyEvent",
                    copyHint: "pixels",
                    _options: {
                        dialogOptions: "display"
                    }
                },
                {
                    _obj: "close",
                    saving: {
                        _enum: "yesNo",
                        _value: "no"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});

            await app.activeDocument.createLayer({})
            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 

            await batchPlay(
                [  
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "blackAndWhite",
                    presetKind: {
                       _enum: "presetKindType",
                       _value: "presetKindDefault"
                    },
                    red: 40,
                    yellow: 60,
                    green: 40,
                    cyan: 60,
                    blue: 20,
                    magenta: 80,
                    useTint: false,
                    tintColor: {
                       _obj: "RGBColor",
                       red: 225.00045776367188,
                       green: 211.00067138671875,
                       blue: 179.00115966796875
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: 
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ,
                    to: {
                       _obj: "layer",
                       name: "Simple B&W conversion"
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                {
                    _obj: "paste",
                    antiAlias: {
                        _enum: "antiAliasType",
                        _value: "antiAliasNone"
                    },
                    as: {
                        _class: "pixel"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: 
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ,
                    to: {
                       _obj: "layer",
                       name: "Classic B&W conversion"
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                {
                    _obj: "set",
                    _target: 
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ,
                    to: {
                       _obj: "layer",
                       opacity: {
                          _unit: "percentUnit",
                          _value: 50
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "select",
                    _target: 
                       {
                          _ref: "layer",
                          _name: "Simple B&W conversion"
                       }
                    ,
                    selectionModifier: {
                       _enum: "selectionModifierType",
                       _value: "addToSelection"
                    },
                    makeVisible: false,
                   
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "make",
                    _target: 
                       {
                          _ref: "layerSection"
                       }
                    ,
                    from: 
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ,
                    layerSectionStart: "Simple B&W conversion",
                    layerSectionEnd: "Classic B&W conversion",
                    name: "Group 1",
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
              
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Filter - Black & White 8"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Filter Black & White 8")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                        FILTER GRAIN SMALL                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_grainsmall() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()

if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({ name: "Filter - Grain Small", opacity: 100, mode: "overlay" })
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
            [
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "gray"
                    },
                    opacity: {
                        _unit: "percentUnit",
                        _value: 100
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
               
                {
                    _obj: "Adobe Camera Raw Filter",
                    $GRNA: 25,
                    $GRNS: 40,
                    $GRNF: 50,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Grain Small")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                       FILTER GRAIN MEDIUM                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_grainmedium() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {


    suspendHistory(async () => {

        await app.activeDocument.createLayer({ name: "Filter - Grain Medium", opacity: 100, mode: "overlay" })
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
            [
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "gray"
                    },
                    opacity: {
                        _unit: "percentUnit",
                        _value: 100
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
               
                {
                    _obj: "Adobe Camera Raw Filter",
                    $GRNA: 40,
                    $GRNS: 50,
                    $GRNF: 50,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Grain Medium")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                        FILTER GRAIN LARGE                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_grainlarge() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({ name: "Filter - Grain Large", opacity: 100, mode: "overlay" })
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
            [
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "gray"
                    },
                    opacity: {
                        _unit: "percentUnit",
                        _value: 100
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
               
                {
                    _obj: "Adobe Camera Raw Filter",
                    $GRNA: 60,
                    $GRNS: 60,
                    $GRNF: 60,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Grain Large")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                     FILTER GRAIN EXTRA LARGE                      /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_grainextralarge() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({ name: "Filter - Grain Extra Large", opacity: 100, mode: "overlay" })
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
            [
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "gray"
                    },
                    opacity: {
                        _unit: "percentUnit",
                        _value: 100
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    $GRNA: 100,
                    $GRNS: 100,
                    $GRNF: 80,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    },"Filter - Grain Extra Large")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                        FILTER VIGNETTING                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_vignetting() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({ name: "Filter - Vignetting"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    
        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    $PCVA: -100,
                    $PCVM: 50,
                    $PCVF: 50,
                    $PCVR: 0,
                    $PCVS: 1,
                    $PCVH: 0,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Filter - Vignetting")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                         FILTER SUN GLOW                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_sunglow() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {
        await app.activeDocument.createLayer({name: "Filter - Sun Glow"})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);   
  
        await batchPlay(
            [{
                    _obj: "make",
                    _target: {
                        _ref: "contentLayer"
                    },
                    using: {
                        _obj: "contentLayer",
                        type: {
                            _obj: "gradientLayer",
                            angle: {
                                _unit: "angleUnit",
                                _value: -171.25
                            },
                            type: {
                                _enum: "gradientType",
                                _value: "radial"
                            },
                            scale: {
                                _unit: "percentUnit",
                                _value: 41
                            },
                            gradient: {
                                _obj: "gradientClassEvent",
                                name: "Custom",
                                gradientForm: {
                                    _enum: "gradientForm",
                                    _value: "customStops"
                                },
                                interfaceIconFrameDimmed: 4096,
                                colors: [{
                                        _obj: "colorStop",
                                        color: {
                                            _obj: "RGBColor",
                                            red: 255,
                                            green: 253.99612426757812,
                                            blue: 249.00009155273438
                                        },
                                        type: {
                                            _enum: "colorStopType",
                                            _value: "userStop"
                                        },
                                        location: 0,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "colorStop",
                                        color: {
                                            _obj: "RGBColor",
                                            red: 255,
                                            green: 253.99612426757812,
                                            blue: 187.00103759765625
                                        },
                                        type: {
                                            _enum: "colorStopType",
                                            _value: "userStop"
                                        },
                                        location: 623,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "colorStop",
                                        color: {
                                            _obj: "RGBColor",
                                            red: 0,
                                            green: 0,
                                            blue: 0
                                        },
                                        type: {
                                            _enum: "colorStopType",
                                            _value: "userStop"
                                        },
                                        location: 4096,
                                        midpoint: 50
                                    }
                                ],
                                transparency: [{
                                        _obj: "transferSpec",
                                        opacity: {
                                            _unit: "percentUnit",
                                            _value: 100
                                        },
                                        location: 0,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "transferSpec",
                                        opacity: {
                                            _unit: "percentUnit",
                                            _value: 100
                                        },
                                        location: 612,
                                        midpoint: 50
                                    },
                                    {
                                        _obj: "transferSpec",
                                        opacity: {
                                            _unit: "percentUnit",
                                            _value: 0
                                        },
                                        location: 4096,
                                        midpoint: 50
                                    }
                                ]
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "contentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "gradientLayer",
                        dither: true,
                        angle: {
                            _unit: "angleUnit",
                            _value: -168.69
                        },
                        type: {
                            _enum: "gradientType",
                            _value: "radial"
                        },
                        scale: {
                            _unit: "percentUnit",
                            _value: 45
                        },
                        gradient: {
                            _obj: "gradientClassEvent",
                            name: "Custom",
                            gradientForm: {
                                _enum: "gradientForm",
                                _value: "customStops"
                            },
                            interfaceIconFrameDimmed: 4096,
                            colors: [{
                                    _obj: "colorStop",
                                    color: {
                                        _obj: "RGBColor",
                                        red: 255,
                                        green: 253.99612426757812,
                                        blue: 249.00009155273438
                                    },
                                    type: {
                                        _enum: "colorStopType",
                                        _value: "userStop"
                                    },
                                    location: 0,
                                    midpoint: 50
                                },
                                {
                                    _obj: "colorStop",
                                    color: {
                                        _obj: "RGBColor",
                                        red: 255,
                                        green: 253.99612426757812,
                                        blue: 187.00103759765625
                                    },
                                    type: {
                                        _enum: "colorStopType",
                                        _value: "userStop"
                                    },
                                    location: 623,
                                    midpoint: 50
                                },
                                {
                                    _obj: "colorStop",
                                    color: {
                                        _obj: "RGBColor",
                                        red: 249.00009155273438,
                                        green: 187.00103759765625,
                                        blue: 139.99786376953125
                                    },
                                    type: {
                                        _enum: "colorStopType",
                                        _value: "userStop"
                                    },
                                    location: 2360,
                                    midpoint: 50
                                },
                                {
                                    _obj: "colorStop",
                                    color: {
                                        _obj: "RGBColor",
                                        red: 253.00003051757812,
                                        green: 185.99716186523438,
                                        blue: 141.00173950195312
                                    },
                                    type: {
                                        _enum: "colorStopType",
                                        _value: "userStop"
                                    },
                                    location: 3773,
                                    midpoint: 50
                                }
                            ],
                            transparency: [{
                                    _obj: "transferSpec",
                                    opacity: {
                                        _unit: "percentUnit",
                                        _value: 100
                                    },
                                    location: 0,
                                    midpoint: 50
                                },
                                {
                                    _obj: "transferSpec",
                                    opacity: {
                                        _unit: "percentUnit",
                                        _value: 100
                                    },
                                    location: 801,
                                    midpoint: 50
                                },
                                {
                                    _obj: "transferSpec",
                                    opacity: {
                                        _unit: "percentUnit",
                                        _value: 100
                                    },
                                    location: 2171,
                                    midpoint: 50
                                },
                                {
                                    _obj: "transferSpec",
                                    opacity: {
                                        _unit: "percentUnit",
                                        _value: 0
                                    },
                                    location: 4096,
                                    midpoint: 50
                                }
                            ]
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "rasterizeLayer",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "overlay"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "move",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "offset",
                        horizontal: {
                            _unit: "distanceUnit",
                            _value: -332.4
                        },
                        vertical: {
                            _unit: "distanceUnit",
                            _value: -184.07999999999998
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "hardLight"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 88
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "move",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "offset",
                        horizontal: {
                            _unit: "distanceUnit",
                            _value: -25.919999999999998
                        },
                        vertical: {
                            _unit: "distanceUnit",
                            _value: 27.119999999999997
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "transform",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    freeTransformCenterState: {
                        _enum: "quadCenterState",
                        _value: "QCSAverage"
                    },
                    offset: {
                        _obj: "offset",
                        horizontal: {
                            _unit: "distanceUnit",
                            _value: 0
                        },
                        vertical: {
                            _unit: "distanceUnit",
                            _value: 0
                        }
                    },
                    width: {
                        _unit: "percentUnit",
                        _value: 300
                    },
                    height: {
                        _unit: "percentUnit",
                        _value: 300
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "move",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "offset",
                        horizontal: {
                            _unit: "distanceUnit",
                            _value: 51.839999999999996
                        },
                        vertical: {
                            _unit: "distanceUnit",
                            _value: -457.44
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "hueSaturation",
                    presetKind: {
                        _enum: "presetKindType",
                        _value: "presetKindCustom"
                    },
                    colorize: false,
                    adjustment: {
                        _obj: "hueSatAdjustmentV2",
                        hue: 0,
                        saturation: -75,
                        lightness: 0
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});

    }, "Filter - Sun Glow")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
/////////////////////////////////////////////////////////////////////////////////////
/////////                        FILTER SUNNY LOOK                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_sunnylook() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name:"Filter - Sunny Look"})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Stamp"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Recover Shadows",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "adaptCorrect",
                    shadowMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 60
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 60
                        },
                        radius: 100
                    },
                    highlightMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 0
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 50
                        },
                        radius: 30
                    },
                    blackClip: 0.01,
                    whiteClip: 0.01,
                    center: 0,
                    colorCorrection: 20,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "luminosity"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 10
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Recover Highlights",
                    version: 2,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "adaptCorrect",
                    shadowMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 0
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 0
                        },
                        radius: 0
                    },
                    highlightMode: {
                        _obj: "adaptCorrectTones",
                        amount: {
                            _unit: "percentUnit",
                            _value: 75
                        },
                        width: {
                            _unit: "percentUnit",
                            _value: 19
                        },
                        radius: 63
                    },
                    blackClip: 0.01,
                    whiteClip: 0.01,
                    center: -10,
                    colorCorrection: 0,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        adjustment: {
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            auto: true
                        }

                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Auto Levels"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 35
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Recover Shadows"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: {
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            input: [
                                3,
                                253
                            ],
                            gamma: 0.9
                        }

                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "screen"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 20
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Lighten"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Darken",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "multiply"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 0
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "hueSaturation",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            colorize: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                                _obj: "hueSatAdjustmentV2",
                                hue: 0,
                                saturation: 30,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 1,
                                beginRamp: 315,
                                beginSustain: 345,
                                endSustain: 15,
                                endRamp: 45,
                                hue: 0,
                                saturation: -15,
                                lightness: 2
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 2,
                                beginRamp: 15,
                                beginSustain: 45,
                                endSustain: 75,
                                endRamp: 105,
                                hue: 0,
                                saturation: -16,
                                lightness: 2
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 25
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Color Increase"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "photoFilter",
                            color: {
                                _obj: "labColor",
                                luminance: 67.06,
                                a: 32,
                                b: 120
                            },
                            density: 25,
                            preserveLuminosity: true
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "photoFilter",
                        color: {
                            _obj: "HSBColorClass",
                            hue: {
                                _unit: "angleUnit",
                                _value: 210.3497314453125
                            },
                            saturation: 100,
                            brightness: 100
                        },
                        density: 30
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Cool Color Grading"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 0
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        adjustment: [{
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "red"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 110,
                                        vertical: 151
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            },
                            {
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "blue"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 151,
                                        vertical: 110
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 10
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Warm Color Grading"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "red"
                                },
                                input: [
                                    8,
                                    253
                                ],
                                gamma: 1.21,
                                output: [
                                    26,
                                    255
                                ]
                            },
                            {
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "green"
                                },
                                input: [
                                    6,
                                    255
                                ],
                                output: [
                                    3,
                                    252
                                ]
                            },
                            {
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "blue"
                                },
                                output: [
                                    6,
                                    255
                                ]
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Rosy Color Grading"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 2
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 61,
                                    vertical: 43
                                },
                                {
                                    _obj: "point",
                                    horizontal: 155,
                                    vertical: 190
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 255
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "luminosity"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 25
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Additional Contrast"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 0
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "normal"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 0
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Contrast"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Auto Levels"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Filter - Sunny Look"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "delete",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },

                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Filter - Sunny Look"
                    },
                    makeVisible: false,

                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Filter - Sunny Look")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                       FILTER GLAMOUR TONE                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function filter_glamtone() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {
        await batchPlay(
            [{
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "blackAndWhite",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            red: 40,
                            yellow: 60,
                            green: 40,
                            cyan: 60,
                            blue: 20,
                            magenta: 80,
                            useTint: false,
                            tintColor: {
                                _obj: "RGBColor",
                                red: 225.00045776367188,
                                green: 211.00067138671875,
                                blue: 179.00115966796875
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "blackAndWhite",
                        red: 6,
                        yellow: 28
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "overlay"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Glamour Tone"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});

            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        }, "Filter - Glamour Tone")
    }
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}


/////////////////////////////////////////////////////////////////////////////////////
/////////                             RESET WB                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function resetwb() {
    const docexists = () => Boolean(app.documents?.length);
    const dexists = docexists();

    if (!dexists) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
        return; // ✅ Exit early
    }

    const layerExistsByName = (name) => {
        return Boolean(app.activeDocument?.layers?.some(layer => layer.name === name));
    };

    const exists = layerExistsByName("White Balance");

    if (!exists) {
        PhotoshopCore.showAlert({ message: 'Adjust White Balance first' });
        return; // ✅ Exit early to avoid duplicate alerts
    }

    // ✅ Only runs if layer exists
    await suspendHistory(async () => {
        await batchPlay([{
            _obj: "set",
            _target: [
                { _ref: "filterFX", _index: 1 },
                { _ref: "layer", _name: "White Balance" }
            ],
            filterFX: {
                _obj: "filterFX",
                filter: {
                    _obj: "Adobe Camera Raw Filter",
                    $WBal: { _enum: "$WBal", _value: "customEnum" },
                    $Temp: 0,
                    $Tint: 0
                }
            },
            _options: {
                dialogOptions: "dontDisplay"
            }
        }], {});

        document.querySelector("#tempSlider").value = 0;
        document.querySelector("#tintSlider").value = 0;
    }, "White Balance reset");
}



/////////////////////////////////////////////////////////////////////////////////////
/////////                             AUTO WB                              /////////
/////////////////////////////////////////////////////////////////////////////////////
async function applyAutoWhiteBalance() {
    const docexists = () => Boolean(app.documents?.length);
    const dexists = docexists();

    if (!dexists) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
        return;
    }

    const layerExistsByName = (name) =>
        Boolean(app.activeDocument?.layers?.some(layer => layer.name === name));

    const exists = layerExistsByName("White Balance");

    await suspendHistory(async () => {
        if (!exists) {
            await app.activeDocument.createLayer({});
            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);

            await batchPlay([
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "set",
                    _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
                    to: { _obj: "layer", name: "White Balance" },
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "newPlacedLayer",
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "Adobe Camera Raw Filter",
                    $WBal: {
                        _enum: "$WBal",
                        _value: "autoEnum"
                    },
                    _options: { dialogOptions: "dontDisplay" }
                }
            ], {});
        } else {
            await batchPlay([
                {
                    _obj: "set",
                    _target: [
                        { _ref: "filterFX", _index: 1 },
                        { _ref: "layer", _name: "White Balance" }
                    ],
                    filterFX: {
                        _obj: "filterFX",
                        filter: {
                            _obj: "Adobe Camera Raw Filter",
                            $WBal: {
                                _enum: "$WBal",
                                _value: "autoEnum"
                            }
                        }
                    },
                    _options: { dialogOptions: "dontDisplay" }
                }
            ], {});
        }
    }, "Auto White Balance");
}

/////////////////////////////////////////////////////////////////////////////////////
/////////                        TEMPERATURE CHANGE                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function tempchange() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {


    const layerExistsByName = (name) => {return Boolean(app.activeDocument?.layers?.some(layer => layer.name === name))}

    const exists = layerExistsByName("White Balance");

    let temp = document.querySelector("#tempSlider").value;

    if (exists === false) {
      
        await app.activeDocument.createLayer({})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);  

            await batchPlay(
                [
            
                    {
                        _obj: "mergeVisible",
                        duplicate: true,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: [{
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        }],
                        to: {
                            _obj: "layer",
                            name: "White Balance"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "newPlacedLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "Adobe Camera Raw Filter",
                        $WBal: {
                            _enum: "$WBal",
                            _value: "customEnum"
                        },
                        $Temp: temp,
                        $Tint: 0,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }
                ], {});    
    }

    if (exists === true) {


        const get_tint_value = () => {
            const result = batchPlay(
                [{
                    _obj: "get",
                    _target: [{
                            _ref: "layer",
                            _name: "White Balance"
                        },
                        {
                            _ref: "document",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        }
                    ],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }], {
                    "synchronousExecution": true,
                });

            return result[0].smartObject.filterFX[0].filter.$Tint;
        }

        const tinto = get_tint_value();

            await batchPlay(
                [{
                    _obj: "set",
                    _target: [{
                            _ref: "filterFX",
                            _index: 1
                        },
                        {
                            _ref: "layer",
                            _name: "White Balance"
                        }
                    ],
                    filterFX: {
                        _obj: "filterFX",
                        filter: {
                            _obj: "Adobe Camera Raw Filter",
                            $WBal: {
                                _enum: "$WBal",
                                _value: "customEnum"
                            },
                            $Temp: temp,
                            $Tint: tinto
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }], {});
    }
}, "Temperature Changed")
setWbMode("manual");
}
else {  
    PhotoshopCore.showAlert({message: '📄 Open an image first'});
    document.querySelector("#tempSlider").value = 0;
}
}
document.getElementById("tempSlider").addEventListener("change", tempchange);

/////////////////////////////////////////////////////////////////////////////////////
/////////                             TINT CHANGE                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function tintchange() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

    const layerExistsByName = (name) => {return Boolean(app.activeDocument?.layers?.some(layer => layer.name === name))}

    const exists = layerExistsByName("White Balance");

    let tint = document.querySelector("#tintSlider").value;

    if (exists === false) {

        
        await app.activeDocument.createLayer({})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);  
        await batchPlay(
                [
                
                    {
                        _obj: "mergeVisible",
                        duplicate: true,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: [{
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        }],
                        to: {
                            _obj: "layer",
                            name: "White Balance"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "newPlacedLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "Adobe Camera Raw Filter",
                        $WBal: {
                            _enum: "$WBal",
                            _value: "customEnum"
                        },
                        $Temp: 0,
                        $Tint: tint,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }

                ], {});             
    }

    if (exists === true) {

        const get_temp_value = () => {
            const result = batchPlay(
                [{
                    _obj: "get",
                    _target: [{
                            _ref: "layer",
                            _name: "White Balance"
                        },
                        {
                            _ref: "document",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        }
                    ],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }], {
                    "synchronousExecution": true,
                });

            return result[0].smartObject.filterFX[0].filter.$Temp;
        }

        const tempo = get_temp_value();

            await batchPlay(
                [{
                    _obj: "set",
                    _target: [{
                            _ref: "filterFX",
                            _index: 1
                        },
                        {
                            _ref: "layer",
                            _name: "White Balance"

                        }
                    ],
                    filterFX: {
                        _obj: "filterFX",
                        filter: {
                            _obj: "Adobe Camera Raw Filter",
                            $WBal: {
                                _enum: "$WBal",
                                _value: "customEnum"
                            },
                            $Temp: tempo,
                            $Tint: tint
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }], {});
      
    }
}, "Tint Changed")
setWbMode("manual");
}
    else {  
        PhotoshopCore.showAlert({message: '📄 Open an image first'});
        document.querySelector("#tintSlider").value = 0;
    }
}
document.getElementById("tintSlider").addEventListener("change", tintchange);



function setWbMode(mode) {
    const modeLabel = document.querySelector("#wbmode");
    const tempSlider = document.querySelector("#tempSlider");
    const tintSlider = document.querySelector("#tintSlider");

    if (mode === "auto") {
        modeLabel.textContent = "Auto White Balance Applied";
        tempSlider.disabled = true;
        tintSlider.disabled = true;
    } else {
        modeLabel.textContent = "Manual White Balance";
        tempSlider.disabled = false;
        tintSlider.disabled = false;
    }
}


/////////////////////////////////////////////////////////////////////////////////////
/////////                          GUIDES CROSS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function cross() {
    const docexists = () => { return Boolean(app.documents?.length) }
    const dexists = docexists()
    if (dexists === true) {
        suspendHistory(async () => {
            await batchPlay(
                [{
                        _obj: "make",
                        new: {
                            _obj: "guide",
                            position: {
                                _unit: "percentUnit",
                                _value: 50
                            },
                            orientation: {
                                _enum: "orientation",
                                _value: "horizontal"
                            },
                            kind: {
                                _enum: "kind",
                                _value: "document"
                            },
                            _target: [{
                                    _ref: "document",
                                    _id: 532
                                },
                                {
                                    _ref: "guide",
                                    _index: 3
                                }
                            ]
                        },
                        _target: [{
                            _ref: "guide"
                        }],
                        guideTarget: {
                            _enum: "guideTarget",
                            _value: "guideTargetCanvas"
                        },
                        guideUserValue: {
                            _unit: "percentUnit",
                            _value: 50
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        new: {
                            _obj: "guide",
                            position: {
                                _unit: "percentUnit",
                                _value: 50
                            },
                            orientation: {
                                _enum: "orientation",
                                _value: "vertical"
                            },
                            kind: {
                                _enum: "kind",
                                _value: "document"
                            },
                            _target: [{
                                    _ref: "document",
                                    _id: 532
                                },
                                {
                                    _ref: "guide",
                                    _index: 4
                                }
                            ]
                        },
                        _target: [{
                            _ref: "guide"
                        }],
                        guideTarget: {
                            _enum: "guideTarget",
                            _value: "guideTargetCanvas"
                        },
                        guideUserValue: {
                            _unit: "percentUnit",
                            _value: 50
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }
                ], {});
        }, "Cross Guides Added")
    }
    else { PhotoshopCore.showAlert({ message: '📄 Open an image first' }); }
}

document.getElementById("btncross").addEventListener("click", cross);

/////////////////////////////////////////////////////////////////////////////////////
/////////                       GUIDES RULE OF THIRDS                        /////////
/////////////////////////////////////////////////////////////////////////////////////

async function ruleOfThirdsGuides() {
    const docexists = () => Boolean(app.documents?.length);
    const dexists = docexists();

    if (dexists === true) {
        suspendHistory(async () => {
            await batchPlay([
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 33.33 },
                        orientation: { _enum: "orientation", _value: "horizontal" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 33.33 },
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 66.66 },
                        orientation: { _enum: "orientation", _value: "horizontal" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 66.66 },
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 33.33 },
                        orientation: { _enum: "orientation", _value: "vertical" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 33.33 },
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 66.66 },
                        orientation: { _enum: "orientation", _value: "vertical" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 66.66 },
                    _options: { dialogOptions: "dontDisplay" }
                }
            ], {});
        }, "Rule of Thirds Guides Added");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}

document.getElementById("btnRuleOfThirds").addEventListener("click", ruleOfThirdsGuides);

/////////////////////////////////////////////////////////////////////////////////////
/////////                       GUIDES GOLDEN RATIO                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function goldenRatioGuides() {
    const docexists = () => Boolean(app.documents?.length);
    const dexists = docexists();

    if (dexists === true) {
        suspendHistory(async () => {
            await batchPlay([
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 38.2 },
                        orientation: { _enum: "orientation", _value: "horizontal" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 38.2 },
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 61.8 },
                        orientation: { _enum: "orientation", _value: "horizontal" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 61.8 },
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 38.2 },
                        orientation: { _enum: "orientation", _value: "vertical" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 38.2 },
                    _options: { dialogOptions: "dontDisplay" }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: { _unit: "percentUnit", _value: 61.8 },
                        orientation: { _enum: "orientation", _value: "vertical" },
                        kind: { _enum: "kind", _value: "document" }
                    },
                    _target: [{ _ref: "guide" }],
                    guideTarget: { _enum: "guideTarget", _value: "guideTargetCanvas" },
                    guideUserValue: { _unit: "percentUnit", _value: 61.8 },
                    _options: { dialogOptions: "dontDisplay" }
                }
            ], {});
        }, "Golden Ratio Guides Added");
    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}

document.getElementById("btnGoldenRatio").addEventListener("click", goldenRatioGuides);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          GUIDES CLEAN                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function clearguides() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    await core.executeAsModal(() => {

        batchPlay(
            [{
                _obj: "clearAllGuides",
                _options: {
                    dialogOptions: "dontDisplay"
                }
            }], {});
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnclearguides").addEventListener("click", clearguides);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           GUIDES ADD                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function addguides() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

    let doc = app.activeDocument;
    let guideswitch = document.querySelector("#guideselect").value;
    let width = doc.width
    let height = doc.height
    let topguide = document.querySelector('#guidetop').value;
    let topnumber = parseInt(topguide);
    let bottomguide = document.querySelector("#guidebottom").value;

    if (guideswitch == "percentUnit") {
        bottomnumber = (100 - parseInt(bottomguide));
    } else {
        bottomnumber = (height - parseInt(bottomguide));
    }
    let leftguide = document.querySelector("#guideleft").value;
    let leftnumber = parseInt(leftguide);

    let rightguide = document.querySelector("#guideright").value;
    if (guideswitch == "percentUnit") {
        rightnumber = (100 - parseInt(rightguide));
    } else {
        rightnumber = (width - parseInt(rightguide));

    }
        await batchPlay(
            [{
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: {
                            _unit: guideswitch,
                            _value: topnumber
                        },
                        orientation: {
                            _enum: "orientation",
                            _value: "horizontal"
                        },
                        kind: {
                            _enum: "kind",
                            _value: "document"
                        },
                        _target: [{
                                _ref: "document",
                                _enum: "ordinal",
                                _value: "targetEnum"
                            },
                            {
                                _ref: "guide",
                            }
                        ]
                    },
                    _target: [{
                        _ref: "guide"
                    }],
                    guideTarget: {
                        _enum: "guideTarget",
                        _value: "guideTargetCanvas"
                    },
                    guideUserValue: {
                        _unit: guideswitch,
                        _value: topnumber
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: {
                            _unit: guideswitch,
                            _value: bottomnumber
                        },
                        orientation: {
                            _enum: "orientation",
                            _value: "horizontal"
                        },
                        kind: {
                            _enum: "kind",
                            _value: "document"
                        },
                        _target: [{
                                _ref: "document",
                                _enum: "ordinal",
                                _value: "targetEnum"
                            },
                            {
                                _ref: "guide",
                            }
                        ]
                    },
                    _target: [{
                        _ref: "guide"
                    }],
                    guideTarget: {
                        _enum: "guideTarget",
                        _value: "guideTargetCanvas"
                    },
                    guideUserValue: {
                        _unit: guideswitch,
                        _value: bottomnumber
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: {
                            _unit: guideswitch,
                            _value: leftnumber
                        },
                        orientation: {
                            _enum: "orientation",
                            _value: "vertical"
                        },
                        kind: {
                            _enum: "kind",
                            _value: "document"
                        },
                        _target: [{
                                _ref: "document",
                                _enum: "ordinal",
                                _value: "targetEnum"
                            },
                            {
                                _ref: "guide",
                            }
                        ]
                    },
                    _target: [{
                        _ref: "guide"
                    }],
                    guideTarget: {
                        _enum: "guideTarget",
                        _value: "guideTargetCanvas"
                    },
                    guideUserValue: {
                        _unit: guideswitch,
                        _value: leftnumber
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _obj: "guide",
                        position: {
                            _unit: guideswitch,
                            _value: rightnumber
                        },
                        orientation: {
                            _enum: "orientation",
                            _value: "vertical"
                        },
                        kind: {
                            _enum: "kind",
                            _value: "document"
                        },
                        _target: [{
                                _ref: "document",
                                _enum: "ordinal",
                                _value: "targetEnum"
                            },
                            {
                                _ref: "guide",
                            }
                        ]
                    },
                    _target: [{
                        _ref: "guide"
                    }],
                    guideTarget: {
                        _enum: "guideTarget",
                        _value: "guideTargetCanvas"
                    },
                    guideUserValue: {
                        _unit: guideswitch,
                        _value: rightnumber
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Guides Added")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnaddguides").addEventListener("click", addguides);

/////////////////////////////////////////////////////////////////////////////////////
/////////                       BACKGROUND DEFAULT                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function bkgdefault() {

    await core.executeAsModal(() => {

        batchPlay(
            [{
                _obj: "set",
                _target: [{
                        _ref: "property",
                        _property: "interfacePrefs"
                    },
                    {
                        _ref: "application",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    }
                ],
                to: {
                    _obj: "interfacePrefs",
                    canvasBackgroundColors: [{
                            _obj: "canvasAttributes",
                            screenMode: {
                                _enum: "canvasScreenMode",
                                _value: "screenModeStandard"
                            },
                            canvasColorMode: {
                                _enum: "canvasColorType",
                                _value: "defaultGray"
                            },
                            canvasFrame: {
                                _enum: "canvasFrameStyle",
                                _value: "none"
                            }
                        },
                        {
                            _obj: "canvasAttributes",
                            screenMode: {
                                _enum: "canvasScreenMode",
                                _value: "screenModeFullScreenWithMenubar"
                            },
                            canvasColorMode: {
                                _enum: "canvasColorType",
                                _value: "defaultGray"
                            },
                            canvasFrame: {
                                _enum: "canvasFrameStyle",
                                _value: "none"
                            }
                        },
                        {
                            _obj: "canvasAttributes",
                            screenMode: {
                                _enum: "canvasScreenMode",
                                _value: "screenModeFullScreen"
                            },
                            canvasColorMode: {
                                _enum: "canvasColorType",
                                _value: "defaultGray"
                            }
                        }
                    ]
                },
                _options: {
                    dialogOptions: "dontDisplay"
                }
            }], {});
    })
}

document.getElementById("btnbkgdefault").addEventListener("click", bkgdefault);

/////////////////////////////////////////////////////////////////////////////////////
/////////                        BACKGROUND BLACK                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function bkgblack() {

    await core.executeAsModal(() => {

        batchPlay(
            [{
                _obj: "set",
                _target: [{
                        _ref: "property",
                        _property: "interfacePrefs"
                    },
                    {
                        _ref: "application",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    }
                ],
                to: {
                    _obj: "interfacePrefs",
                    canvasBackgroundColors: [{
                            _obj: "canvasAttributes",
                            screenMode: {
                                _enum: "canvasScreenMode",
                                _value: "screenModeStandard"
                            },
                            canvasColorMode: {
                                _enum: "canvasColorType",
                                _value: "black"
                            },
                            canvasFrame: {
                                _enum: "canvasFrameStyle",
                                _value: "none"
                            }
                        },
                        {
                            _obj: "canvasAttributes",
                            screenMode: {
                                _enum: "canvasScreenMode",
                                _value: "screenModeFullScreenWithMenubar"
                            },
                            canvasColorMode: {
                                _enum: "canvasColorType",
                                _value: "black"
                            },
                            canvasFrame: {
                                _enum: "canvasFrameStyle",
                                _value: "none"
                            }
                        },
                        {
                            _obj: "canvasAttributes",
                            screenMode: {
                                _enum: "canvasScreenMode",
                                _value: "screenModeFullScreen"
                            },
                            canvasColorMode: {
                                _enum: "canvasColorType",
                                _value: "black"
                            }
                        }
                    ]
                },
                _options: {
                    dialogOptions: "dontDisplay"
                }
            }], {});
    })
}

document.getElementById("btnbkgblack").addEventListener("click", bkgblack);

/////////////////////////////////////////////////////////////////////////////////////
/////////                        BACKGROUND WHITE                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function bkgwhite() {
    await core.executeAsModal(() => {

        batchPlay(
            [{
                    _obj: "set",
                    _target: [{
                            _ref: "property",
                            _property: "interfacePrefs"
                        },
                        {
                            _ref: "application",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        }
                    ],
                    to: {
                        _obj: "interfacePrefs",
                        canvasBackgroundColors: [{
                                _obj: "canvasAttributes",
                                screenMode: {
                                    _enum: "canvasScreenMode",
                                    _value: "screenModeStandard"
                                },
                                canvasColorMode: {
                                    _enum: "canvasColorType",
                                    _value: "custom"
                                }
                            },
                            {
                                _obj: "canvasAttributes",
                                screenMode: {
                                    _enum: "canvasScreenMode",
                                    _value: "screenModeFullScreenWithMenubar"
                                },
                                canvasColorMode: {
                                    _enum: "canvasColorType",
                                    _value: "custom"
                                }
                            },
                            {
                                _obj: "canvasAttributes",
                                screenMode: {
                                    _enum: "canvasScreenMode",
                                    _value: "screenModeArtboard"
                                },
                                canvasColorMode: {
                                    _enum: "canvasColorType",
                                    _value: "custom"
                                }
                            },
                            {
                                _obj: "canvasAttributes",
                                screenMode: {
                                    _enum: "canvasScreenMode",
                                    _value: "screenModeFullScreen"
                                },
                                canvasColorMode: {
                                    _enum: "canvasColorType",
                                    _value: "custom"
                                }
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: [{
                            _ref: "property",
                            _property: "interfacePrefs"
                        },
                        {
                            _ref: "application",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        }
                    ],
                    to: {
                        _obj: "interfacePrefs",
                        canvasBackgroundColors: [{
                            _obj: "canvasAttributes",
                            screenMode: {
                                _enum: "canvasScreenMode",
                                _value: "screenModeStandard"
                            },
                            color: {
                                _obj: "RGBColor",
                                red: 255,
                                green: 255,
                                blue: 255
                            }
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    })
}


document.getElementById("btnbkgwhite").addEventListener("click", bkgwhite);

/////////////////////////////////////////////////////////////////////////////////////
/////////                             LAYER NEW                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function layernew() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    await core.executeAsModal(() => {

        batchPlay(
            [{
                _obj: "make",
                _target: [{
                    _ref: "layer"
                }],
                _options: {
                    dialogOptions: "dontDisplay"
                }
            }], {});
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnlayernew").addEventListener("click", layernew);


/////////////////////////////////////////////////////////////////////////////////////
/////////                          LAYER FLATTEN                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function layerflatten() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    await core.executeAsModal(() => {

        batchPlay(
            [{
                _obj: "flattenImage",
                _options: {
                    dialogOptions: "dontDisplay"
                }
            }], {});

        const layerExistsByName = (name) => {return Boolean(app.activeDocument?.layers?.some(layer => layer.name === name))}
        const existsWB = layerExistsByName("White Balance");

        if (existsWB === false) {
            document.querySelector("#tempSlider").value = 0;
            document.querySelector("#tintSlider").value = 0;
        }
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnlayerflatten").addEventListener("click", layerflatten);

/////////////////////////////////////////////////////////////////////////////////////
/////////                         LAYER DUPLICATE                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function layerduplicate() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    await core.executeAsModal(() => {

        batchPlay(
            [{
                _obj: "duplicate",
                _target: [{
                    _ref: "layer",
                    _enum: "ordinal",
                    _value: "targetEnum"
                }],
                _options: {
                    dialogOptions: "dontDisplay"
                }
            }], {});
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnlayerduplicate").addEventListener("click", layerduplicate);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           LAYER STAMP                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function layerstamp() {

    const docexists = () => {return Boolean(app.documents?.length)}
      const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

       await app.activeDocument.createLayer({})
       await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "New Stamp Layer")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnlayerstamp").addEventListener("click", layerstamp);

/////////////////////////////////////////////////////////////////////////////////////
/////////                             LIQUIFY                               /////////
/////////////////////////////////////////////////////////////////////////////////////

async function liquify() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
        
if (exists === true) {
    await core.executeAsModal(() => {

        batchPlay(
            [{
                    _obj: "$LqFy",
                    _options: {
                        dialogOptions: "display"
                    }
                }

            ], {});
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnliquify").addEventListener("click", liquify);

/////////////////////////////////////////////////////////////////////////////////////
/////////                       CONTENT AWARE FILL                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function contentaware() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
          
if (exists === true) {

    await core.executeAsModal(() => {

        batchPlay(
            [{
                _obj: "fill",
                using: {
                    _enum: "fillContents",
                    _value: "contentAware"
                },
                contentAwareColorAdaptationFill: false,
                contentAwareRotateFill: false,
                contentAwareScaleFill: false,
                contentAwareMirrorFill: false,
                opacity: {
                    _unit: "percentUnit",
                    _value: 100
                },
                mode: {
                    _enum: "blendMode",
                    _value: "normal"
                },
                _options: {
                    dialogOptions: "dontDisplay"
                }
            }], {});
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btncontentaware").addEventListener("click", contentaware);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          SAVE FOR WEB                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function saveforweb() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    await core.executeAsModal(() => {

    const psCore = require('photoshop').core;
    psCore.performMenuCommand({"commandID": 1695});
})
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsaveforweb").addEventListener("click", saveforweb);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            EXPORT AS                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function exportas() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    await core.executeAsModal(() => {

    const psCore = require('photoshop').core;
    psCore.performMenuCommand({"commandID": 3443});
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnexportas").addEventListener("click", exportas);

/////////////////////////////////////////////////////////////////////////////////////
/////////                        SAVE FOR INSTA                             /////////
/////////////////////////////////////////////////////////////////////////////////////
/* 

async function saveforinsta() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

    let doc = app.activeDocument;
    const docwidth = doc.width;
    const docheight = doc.height;


        if (docwidth != docheight) {
            await batchPlay(
                [{
                        _obj: "set",
                        _target: {
                            _ref: "color",
                            _property: "backgroundColor"
                        },
                        to: {
                            _obj: "HSBColorClass",
                            hue: {
                                _unit: "angleUnit",
                                _value: 0
                            },
                            saturation: 0,
                            brightness: 100
                        },
                        source: "photoshopPicker",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },

                ], {});

            doc.resizeCanvas(Math.max(doc.width, doc.height), Math.max(doc.width, doc.height));

        }

    }, "Canvas size changed")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsaveforinsta").addEventListener("click", saveforinsta); */

/////////////////////////////////////////////////////////////////////////////////////
/////////                        SAVE FOR INSTA                             /////////
/////////////////////////////////////////////////////////////////////////////////////
/* 

async function saveforinstablack() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

    let doc = app.activeDocument;
    const docwidth = doc.width;
    const docheight = doc.height;

        if (docwidth != docheight) {
            await batchPlay(
                [{
                        _obj: "set",
                        _target: {
                            _ref: "color",
                            _property: "backgroundColor"
                        },
                        to: {
                            _obj: "HSBColorClass",
                            hue: {
                                _unit: "angleUnit",
                                _value: 0
                            },
                            saturation: 0,
                            brightness: 0
                        },
                        source: "photoshopPicker",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },

                ], {});

            doc.resizeCanvas(Math.max(doc.width, doc.height), Math.max(doc.width, doc.height));

        }



    }, "Canvas size changed")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsaveforinstablack").addEventListener("click", saveforinstablack); */
/////////////////////////////////////////////////////////////////////////////////////
/////////                         DODGE AND BURN GRAY                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function dbgrey() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {
        await batchPlay([
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    using: {
                        _obj: "layerSection",
                        name: "DODGE & BURN 50% GRAY"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layer"
                    },
                    using: {
                        _obj: "layer",
                        name: "Soft Light"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "gray"
                    },
                    opacity: {
                        _unit: "percentUnit",
                        _value: 100
                    },
                    mode: {
                        _enum: "blendMode",
                        _value: "normal"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "softLight"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layer"
                    },
                    using: {
                        _obj: "layer",
                        name: "Overlay"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "gray"
                    },
                    opacity: {
                        _unit: "percentUnit",
                        _value: 100
                    },
                    mode: {
                        _enum: "blendMode",
                        _value: "normal"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "overlay"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "channelMixer",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            red: {
                                _obj: "channelMatrix",
                                red: {
                                    _unit: "percentUnit",
                                    _value: 100
                                }
                            },
                            grain: {
                                _obj: "channelMatrix",
                                grain: {
                                    _unit: "percentUnit",
                                    _value: 100
                                }
                            },
                            blue: {
                                _obj: "channelMatrix",
                                blue: {
                                    _unit: "percentUnit",
                                    _value: 100
                                }
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "channelMixer",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        monochromatic: true,
                        gray: {
                            _obj: "channelMatrix",
                            red: {
                                _unit: "percentUnit",
                                _value: -70
                            },
                            green: {
                                _unit: "percentUnit",
                                _value: 200
                            },
                            blue: {
                                _unit: "percentUnit",
                                _value: -30
                            },
                            constant: {
                                _unit: "percentUnit",
                                _value: 0
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "BW HELP LAYER"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "hide",
                    null: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "DODGE & BURN 50% GRAY"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
    
            ], {});
           await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

           await batchPlay([
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Soft Light"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "dodgeTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "exchange",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "dodgeTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "exposure": 2,
                        "useLegacy": true
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "dodgeTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "mode": {
                            "_enum": "blendMode",
                            "_value": "dodgeM"
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 15
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 25
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },

            ], {});
        }, "Dodge & Burn - 50% Gray")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btndbgrey").addEventListener("click", dbgrey);


/////////////////////////////////////////////////////////////////////////////////////
/////////                                EYES                               /////////
/////////////////////////////////////////////////////////////////////////////////////

async function eyes() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);  

        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Stamp"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Iris Sharpening",
                    version: 2,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "unsharpMask",
                    amount: {
                        _unit: "percentUnit",
                        _value: 30
                    },
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 4
                    },
                    threshold: 0,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "highPass",
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 13.5
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "overlay"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 95
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Additional Iris Enhance",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "colorDodge"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 20
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Iris Sharpening"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "hueSaturation",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            colorize: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Whites"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                                _obj: "hueSatAdjustmentV2",
                                hue: 0,
                                saturation: 55,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 1,
                                beginRamp: 315,
                                beginSustain: 345,
                                endSustain: 15,
                                endRamp: 45,
                                hue: 0,
                                saturation: -35,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 6,
                                beginRamp: 255,
                                beginSustain: 285,
                                endSustain: 315,
                                endRamp: 345,
                                hue: 0,
                                saturation: -25,
                                lightness: 0
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        adjustment: {
                            _obj: "hueSatAdjustmentV2",
                            hue: 0,
                            saturation: 70,
                            lightness: 0
                        }

                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Color Increase"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 20
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 61,
                                    vertical: 76
                                },
                                {
                                    _obj: "point",
                                    horizontal: 93,
                                    vertical: 141
                                },
                                {
                                    _obj: "point",
                                    horizontal: 140,
                                    vertical: 199
                                },
                                {
                                    _obj: "point",
                                    horizontal: 204,
                                    vertical: 242
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 255
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "screen"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 20
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Iris Brightening"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Additional Iris Enhance"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Additional Iris Enhance"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Iris Brightening"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Iris"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 70
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            gamma: 1.04
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "screen"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 60
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Brighten Whites"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "hueSaturation",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            colorize: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                                _obj: "hueSatAdjustmentV2",
                                localRange: 1,
                                beginRamp: 315,
                                beginSustain: 345,
                                endSustain: 15,
                                endRamp: 45,
                                hue: 0,
                                saturation: -50, //-25
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 2,
                                beginRamp: 15,
                                beginSustain: 45,
                                endSustain: 75,
                                endRamp: 105,
                                hue: 0,
                                saturation: -50,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 4,
                                beginRamp: 135,
                                beginSustain: 165,
                                endSustain: 195,
                                endRamp: 225,
                                hue: 0,
                                saturation: -70,
                                lightness: 20
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 5,
                                beginRamp: 195,
                                beginSustain: 225,
                                endSustain: 255,
                                endRamp: 285,
                                hue: 0,
                                saturation: -55,
                                lightness: 25
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 6,
                                beginRamp: 255,
                                beginSustain: 285,
                                endSustain: 315,
                                endRamp: 345,
                                hue: 0,
                                saturation: -50, //-25
                                lightness: 0
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        adjustment: {
                            _obj: "hueSatAdjustmentV2",
                            hue: 0,
                            saturation: 0,
                            lightness: 1
                        }

                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Desaturate Whites"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Desaturate Whites"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelection"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 95
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            gamma: 1.26
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "screen"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            input: [
                                0,
                                139
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Brighten Whites 2"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "hide",
                    null: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Brighten Whites"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Whites"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 60
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
              
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
              

                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "delete",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },

                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Brighten Whites"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Iris"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    // layerID: [
                    //    115,
                    //    118,
                    //    110,
                    //    111,
                    //    112,
                    //    113,
                    //    105,
                    //    103,
                    //    106,
                    //    107,
                    //    108
                    // ],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    layerSectionStart: 121,
                    layerSectionEnd: 122,
                    name: "Group 1",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Eyes Enhancer"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "violet"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Iris"
                    },
                    makeVisible: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Eyes Enhancer")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btneyes").addEventListener("click", eyes);


/////////////////////////////////////////////////////////////////////////////////////
/////////                              SKIN MATT                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function skinmatt() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {
    suspendHistory(async () => {

        await app.activeDocument.createLayer({name:"Skin Color"})
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);  

        PhotoshopCore.showAlert({message: 'In the next step select the skin tone that will be used as the reffference for the Mattifier.'});

        await batchPlay(
            [
                {
                    "_obj": "showColorPicker",
                    "context": "General Picker",
                    "application": {
                        "_class": "null"
                    },
                    "value": true,
                    "RGBFloatColor": {
                        "_obj": "RGBColor",
                        "red": 225.99610894941634,
                        "grain": 193.99610894941634,
                        "blue": 173
                    },
                    "dontRecord": true,
                    "forceNotify": true,
                    "_isCommand": true,
                    "_options": {
                        "dialogOptions": "display"
                    }
                },
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "foregroundColor"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        blendRange: {
                            _obj: "blendRange",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "gray"
                            },
                            srcBlackMin: 0,
                            srcBlackMax: 0,
                            srcWhiteMin: 255,
                            srcWhiteMax: 255,
                            destBlackMin: 127,
                            destBlackMax: 255,
                            destWhiteMin: 255,
                            desaturate: 255
                        },
                        layerEffects: {
                            _obj: "layerEffects",
                            scale: {
                                _unit: "percentUnit",
                                _value: 100
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    using: {
                        _obj: "layerSection",
                        name: "Skin Mattifier",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 50
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {});
    }, "Skin Mattifier")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}


document.getElementById("btnskinmatt").addEventListener("click", skinmatt);


/////////////////////////////////////////////////////////////////////////////////////
/////////                              DUAL VIEW                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function dualview() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
     
if (exists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: "select",
                    _target: {
                        _ref: "menuItemClass",
                        _enum: "menuItemType",
                        _value: "newView"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "menuItemClass",
                        _enum: "menuItemType",
                        _value: "tileVertically"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "menuItemClass",
                        _enum: "menuItemType",
                        _value: "fitOnScreen"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "menuItemClass",
                        _enum: "menuItemType",
                        _value: "matchZoom"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "menuItemClass",
                        _enum: "menuItemType",
                        _value: "actualPixels"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Dual View")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btndualview").addEventListener("click", dualview);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           REDUCE REDNESS                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function reduceredness() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        mode: {
                            _enum: "blendMode",
                            _value: "color"
                        },
                        color: {
                            _enum: "color",
                            _value: "red"
                        },
                        type: {
                            _obj: "hueSaturation",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindCustom"
                            },
                            colorize: false,
                            adjustment: {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 1,
                                beginRamp: 315,
                                beginSustain: 345,
                                endSustain: 15,
                                endRamp: 45,
                                hue: 5,
                                saturation: -30,
                                lightness: 0
                            }

                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Redness Reducer"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        blendRange: [{
                            _obj: "blendRange",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "gray"
                            },
                            srcBlackMin: 0,
                            srcBlackMax: 0,
                            srcWhiteMin: 255,
                            srcWhiteMax: 255,
                            destBlackMin: 0,
                            destBlackMax: 128,
                            destWhiteMin: 255,
                            desaturate: 255
                        }],
                        layerEffects: {
                            _obj: "layerEffects",
                            scale: {
                                _unit: "percentUnit",
                                _value: 100
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },

                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "red"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "invert",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 50
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});

            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    
   
    }, "Reduce Redness")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}


document.getElementById("btnreduceredness").addEventListener("click", reduceredness);

/////////////////////////////////////////////////////////////////////////////////////
/////////                       DODGE HIGHLIGHTS BRUSH                      /////////
/////////////////////////////////////////////////////////////////////////////////////
/*
async function dodgehightool() {

    suspendHistory(async () => {

       await batchPlay(
            [{
                    _obj: "select",
                    _target: {
                        _ref: "dodgeTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "dodgeTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "mode": {
                            "_enum": "blendMode",
                            "_value": "dodgeH"
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "dodgeTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "exposure": 100,
                        "useLegacy": true
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 1
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
            ], {});
    }, "Dodge Highlights Brush")
}

document.getElementById("btndodgehightool").addEventListener("click", dodgehightool); */

/////////////////////////////////////////////////////////////////////////////////////
/////////                         CLONE LIGHTEN BRUSH                       /////////
/////////////////////////////////////////////////////////////////////////////////////

async function clonelighten() {

    suspendHistory(async () => {

        await batchPlay(
            [

                {
                    _obj: "select",
                    _target: {
                        _ref: "cloneStampTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "cloneStampTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "mode": {
                            "_enum": "blendMode",
                            "_value": "lighten"
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "cloneStampTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "opacity": 100,
                        "flow": 100
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 1
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                }
            ], {});
    }, "Clone Lighten Brush")
}

document.getElementById("btnclonelighten").addEventListener("click", clonelighten);



/////////////////////////////////////////////////////////////////////////////////////
/////////                           SKIN SOFTENING 2                        /////////
/////////////////////////////////////////////////////////////////////////////////////

async function softskin2() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);  

        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "newPlacedLayer",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Softening"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "surfaceBlur",
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 60
                    },
                    threshold: 30,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "copyToLayer",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "delete",
                    _target: [{
                            _ref: "filterFX",
                            _index: 1
                        },
                        {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        }
                    ],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Details"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "highPass",
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 2
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "linearLight"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 75
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Softening"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    // layerID: [
                    //     148,
                    //     149
                    // ],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    using: {
                        _obj: "layerSection",
                        name: "Skin Softening"
                    },
                    name: "Skin Softening",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 65
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "green"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "invert",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }

            ], {
                "historyStateInfo": {
                    "name": "Skin Softening",
                    "target": {
                        "_ref": "document",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    }
                }
            });
    })
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsoftskin2").addEventListener("click", softskin2);
/////////////////////////////////////////////////////////////////////////////////////
/////////                              ADD NOISE                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function addnoise() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
     
      
if (exists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: "make",
                    _target: {
                        _ref: "layer"
                    },
                    using: {
                        _obj: "layer",
                        name: "NOISE",
                        color: {
                            _enum: "color",
                            _value: "gray"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: [{
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    }],
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "gray"
                    },
                    opacity: {
                        _unit: "percentUnit",
                        _value: 100
                    },
                    mode: {
                        _enum: "blendMode",
                        _value: "normal"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "overlay"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "addNoise",
                    distort: {
                        _enum: "distort",
                        _value: "gaussianDistribution"
                    },
                    noise: {
                        _unit: "percentUnit",
                        _value: 4
                    },
                    monochromatic: true,
                    $FlRs: 393350,
                    _options: {
                        dialogOptions: "display"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
               
            ], {});
            
        }, "Add Noise")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
document.getElementById("btnaddnoise").addEventListener("click", addnoise);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           SELECT AND MASK                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function selectandmask() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
     
      
if (exists === true) {
    await core.executeAsModal(() => {

        batchPlay(
            [

                {
                    _obj: 'refineSelectionEdge',
                    _options: {
                        dialogOptions: 'display'
                    }
                }


            ], {});
    })

}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}    
}
document.getElementById("btnselectandmask").addEventListener("click", selectandmask);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            SKIN CONTRAST                          /////////
/////////////////////////////////////////////////////////////////////////////////////

async function skincontrast() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [
                {
                    _obj: "make",
                    _target: {
                        _ref: "document"
                    },
                    using: {
                        _ref: "historyState",
                        _property: "currentHistoryState"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "flattenImage",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "convertMode",
                    to: {
                        _class: "CMYKColorMode"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "yellow"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "channel",
                        _property: "selection"
                    },
                    to: {
                        _enum: "ordinal",
                        _value: "allEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "copyEvent",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "close",
                    saving: {
                        _enum: "yesNo",
                        _value: "no"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "paste",
                    antiAlias: {
                        _enum: "antiAliasType",
                        _value: "antiAliasNone"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});

                await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

          await batchPlay(
            [

                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "overlay"
                        },
                        layerEffects: {
                            _obj: "layerEffects",
                            scale: {
                                _unit: "percentUnit",
                                _value: 100
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Skin Contrast"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 50
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
            
    
    }, "Skin Contrast")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnskincontrast").addEventListener("click", skincontrast);


/////////////////////////////////////////////////////////////////////////////////////
/////////                               VOLUME                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function volume() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({name: "Volume"})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);  

        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "unsharpMask",
                    amount: {
                        _unit: "percentUnit",
                        _value: 35
                    },
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 85
                    },
                    threshold: 0,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 100
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "blue"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "luminosity"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Volume")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnvolume").addEventListener("click", volume);

/////////////////////////////////////////////////////////////////////////////////////
/////////                              SKIN TAN                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function skintan() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "red"
                                },
                                gamma: 1.76
                            },
                            {
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "green"
                                },
                                gamma: 0.87
                            },
                            {
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "blue"
                                },
                                gamma: 1.04
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Blush"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "hide",
                    null: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "multiply"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Darken"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "composite"
                                },
                                gamma: 0.95
                            },
                            {
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "red"
                                },
                                gamma: 1.2
                            },
                            {
                                _obj: "levelsAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "blue"
                                },
                                gamma: 0.75
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Bronzer"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Blush"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Skin Tan"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 40
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

    }, "Skin Tan")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnskintan").addEventListener("click", skintan);

/////////////////////////////////////////////////////////////////////////////////////
/////////                             SHARPENING                            /////////
/////////////////////////////////////////////////////////////////////////////////////
 
async function sharpen() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
     
      
if (exists === true) {

    suspendHistory(async () => {

        await batchPlay(
     
            [
                {
                    _obj: "make",
                    _target: 
                       {
                          _ref: "document"
                       }
                    ,
                    using: 
                       {
                          _ref: "historyState",
                          _property: "currentHistoryState"
                       }
                    ,
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "flattenImage",
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
              
        {
           _obj: "convertMode",
           to: {
              _class: "labColorMode"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp1"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp2"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp3"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp8"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp7"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp1"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "fill",
           using: {
              _enum: "fillContents",
              _value: "gray"
           },
           opacity: {
              _unit: "percentUnit",
              _value: 100
           },
           mode: {
              _enum: "blendMode",
              _value: "normal"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "lightness"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _name: "temp2"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _name: "temp3"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _name: "temp8"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _name: "temp7"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lightness"
                 },
                 {
                    _ref: "layer",
                    _name: "temp2"
                 }
              ]
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp9"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "Scratch Layer 7"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "make",
           new: {
              _class: "channel"
           },
           at: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "mask"
              }
           ,
           using: {
              _enum: "userMaskEnabled",
              _value: "revealAll"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "duplicate",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           version: 2,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "Scratch Layer 8"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp1"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp12"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp9"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp10"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "Scratch Layer 7"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp11"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "Scratch Layer 8"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp5"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp2"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp13"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp3"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp4"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp8"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp6"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "temp6"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp7"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              name: "Original"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _name: "temp10"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _name: "temp11"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _name: "temp5"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp12"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "unsharpMask",
           amount: {
              _unit: "percentUnit",
              _value: 500
           },
           radius: {
              _unit: "pixelsUnit",
              _value: 1.5
           },
           threshold: 0,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp11"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "lightness"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "show",
           null: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lightness"
                 },
                 {
                    _ref: "layer",
                    _name: "temp12"
                 }
              ]
           },
              calculation: {
                 _enum: "calculationType",
                 _value: "darken"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lightness"
                 },
                 {
                    _ref: "layer",
                    _property: "background"
                 }
              ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "difference"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "ordinal",
                    _value: "targetEnum"
                 }
                 ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "screen"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "invert",
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              mode: {
                 _enum: "blendMode",
                 _value: "multiply"
              }
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "delete",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp12"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "mask"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "hide",
           null: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "show",
           null: 
              {
                 _ref: "layer",
                 _name: "temp10"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp10"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "unsharpMask",
           amount: {
              _unit: "percentUnit",
              _value: 500
           },
           radius: {
              _unit: "pixelsUnit",
              _value: 0.6
           },
           threshold: 0,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp5"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "show",
           null: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "lightness"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lightness"
                 },
                 {
                    _ref: "layer",
                    _name: "temp10"
                 }
              ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "lighten"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lightness"
                 },
                 {
                    _ref: "layer",
                    _property: "background"
                 }
              ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "difference"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "ordinal",
                    _value: "targetEnum"
                 }
              ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "screen"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              mode: {
                 _enum: "blendMode",
                 _value: "screen"
              }
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              opacity: {
                 _unit: "percentUnit",
                 _value: 7
              }
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              opacity: {
                 _unit: "percentUnit",
                 _value: 75
              }
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "show",
           null: 
              {
                 _ref: "layer",
                 _name: "temp11"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "delete",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp10"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "show",
           null: 
              {
                 _ref: "layer",
                 _name: "temp13"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp13"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "lightness"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "unsharpMask",
           amount: {
              _unit: "percentUnit",
              _value: 500
           },
           radius: {
              _unit: "pixelsUnit",
              _value: 35
           },
           threshold: 3,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lightness"
                 },
                 {
                    _ref: "layer",
                    _property: "background"
                 }
              ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "darken"
              },
              opacity: {
                 _unit: "percentUnit",
                 _value: 50
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "make",
           new: {
              _class: "channel"
           },
           at: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "mask"
              }
           ,
           using: {
              _enum: "userMaskEnabled",
              _value: "revealAll"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lightness"
                 },
                 {
                    _ref: "layer",
                    _property: "background"
                 }
              ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "darken"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              opacity: {
                 _unit: "percentUnit",
                 _value: 12
              }
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp6"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "show",
           null: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "unsharpMask",
           amount: {
              _unit: "percentUnit",
              _value: 175
           },
           radius: {
              _unit: "pixelsUnit",
              _value: 35
           },
           threshold: 3,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              mode: {
                 _enum: "blendMode",
                 _value: "color"
              }
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "set",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           to: {
              _obj: "layer",
              opacity: {
                 _unit: "percentUnit",
                 _value: 15
              }
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp4"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "delete",
           _target: 
              {
                 _ref: "layer",
                 _enum: "ordinal",
                 _value: "targetEnum"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "layer",
                 _name: "temp5"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: 
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "mask"
              }
           ,
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "a"
                 },
                 {
                    _ref: "layer",
                    _name: "Original"
                 }
              ]},
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "a"
                 },
                 {
                    _ref: "layer",
                    _name: "Original"
                 }
              ]},
              invert: true,
              calculation: {
                 _enum: "calculationType",
                 _value: "lighten"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "b"
                 },
                 {
                    _ref: "layer",
                    _name: "Original"
                 }
              ]},
              invert: true,
              calculation: {
                 _enum: "calculationType",
                 _value: "lighten"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "b"
                 },
                 {
                    _ref: "layer",
                    _name: "Original"
                 }
              ]},
              calculation: {
                 _enum: "calculationType",
                 _value: "lighten"
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "surfaceBlur",
           radius: {
              _unit: "pixelsUnit",
              _value: 5
           },
           threshold: 5,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "levels",
           auto: true,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "lab"
                 },
                 {
                    _ref: "layer",
                    _name: "Original"
                 }
              ]},
              opacity: {
                 _unit: "percentUnit",
                 _value: 50
              },
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "invert",
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "gaussianBlur",
           radius: {
              _unit: "pixelsUnit",
              _value: 6
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "levels",
           auto: true,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: [
              {
                 _ref: "channel",
                 _enum: "channel",
                 _value: "mask"
              },
              {
                 _ref: "layer",
                 _name: "temp11"
              }
           ],
           makeVisible: false,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "applyImageEvent",
           with: {
              _obj: "calculation",
              to: {
                 _ref: [
                 {
                    _ref: "channel",
                    _enum: "channel",
                    _value: "mask"
                 },
                 {
                    _ref: "layer",
                    _name: "temp5"
                 }
              ]},
              preserveTransparency: true
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "curves",
           presetKind: {
              _enum: "presetKindType",
              _value: "presetKindCustom"
           },
           adjustment: [
              {
                 _obj: "curvesAdjustment",
                 channel: 
                    {
                       _ref: "channel",
                       _enum: "ordinal",
                       _value: "targetEnum"
                    }
                 ,
                 curve: [
                    {
                       _obj: "point",
                       horizontal: 0,
                       vertical: 0
                    },
                    {
                       _obj: "point",
                       horizontal: 105,
                       vertical: 69
                    },
                    {
                       _obj: "point",
                       horizontal: 255,
                       vertical: 255
                    }
                 ]
              }
           ],
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "delete",
           _target: [
              {
                 _ref: "layer",
                 _name: "Original"
              }
           ],
           _options: {
              dialogOptions: "dontDisplay"
           }
        }  ], {});

        await batchPlay([
          {
        _obj: "flattenImage",
        _options: {
           dialogOptions: "dontDisplay"
        }
     },
     {
        _obj: "convertMode",
        to: {
           _class: "RGBColorMode"
        },
        _options: {
           dialogOptions: "dontDisplay"
        }
     },
     {
        _obj: "set",
        _target: 
           {
              _ref: "channel",
              _property: "selection"
           }
        ,
        to: {
           _enum: "ordinal",
           _value: "allEnum"
        },
        _options: {
           dialogOptions: "dontDisplay"
        }
     },
     {
        _obj: "copyEvent",
        copyHint: "pixels",
        _options: {
           dialogOptions: "dontDisplay"
        }
     },
     {
        _obj: "close",
        saving: {
           _enum: "yesNo",
           _value: "no"
        },
        _options: {
           dialogOptions: "dontDisplay"
        }
     },
     {
        _obj: "paste",
        antiAlias: {
           _enum: "antiAliasType",
           _value: "antiAliasNone"
        },
        as: {
           _class: "pixel"
        },
        _options: {
           dialogOptions: "dontDisplay"
        }
     }
    ], {});


// move to top
await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

    await batchPlay([
     {
        _obj: "set",
        _target: [
           {
              _ref: "layer",
              _enum: "ordinal",
              _value: "targetEnum"
           }
        ],
        to: {
           _obj: "layer",
           name: "Smart Sharpening"
        },
        _options: {
           dialogOptions: "dontDisplay"
        }
     },
        {
           _obj: "make",
           new: {
              _class: "channel"
           },
           at: {
              _ref: "channel",
              _enum: "channel",
              _value: "mask"
           },
           using: {
              _enum: "userMaskEnabled",
              _value: "revealAll"
           },
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "select",
           _target: [
              {
                 _ref: "paintbrushTool"
              }
           ],
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "reset",
           _target: 
              {
                 _ref: "color",
                 _property: "colors"
              }
           ,
           _options: {
              dialogOptions: "dontDisplay"
           }
        },
        {
           _obj: "exchange",
           _target: [
              {
                 _ref: "color",
                 _property: "colors"
              }
           ],
           _options: {
              dialogOptions: "dontDisplay"
           }
        }
             ]
            ,{});

        }, "It's so sharp now!")

}
else {PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsharpen").addEventListener("click", sharpen);


/////////////////////////////////////////////////////////////////////////////////////
/////////                            WHITE TEETH                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function teeth() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

       await batchPlay(
            [
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },

                    name: "Group 1",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Teeth Whitening"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 80
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },

                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            input: [
                                0,
                                221
                            ],
                            gamma: 1.07
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "screen"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 45
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Lighten Teeth"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "blue"
                            },
                            gamma: 1.85
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 20
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Reduce Yellow"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "hueSaturation",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            colorize: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                                _obj: "hueSatAdjustmentV2",
                                localRange: 1,
                                beginRamp: 315,
                                beginSustain: 345,
                                endSustain: 15,
                                endRamp: 45,
                                hue: 0,
                                saturation: -5,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 2,
                                beginRamp: 15,
                                beginSustain: 45,
                                endSustain: 75,
                                endRamp: 105,
                                hue: 0,
                                saturation: -100,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 3,
                                beginRamp: 75,
                                beginSustain: 105,
                                endSustain: 135,
                                endRamp: 165,
                                hue: 0,
                                saturation: -6,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 4,
                                beginRamp: 135,
                                beginSustain: 165,
                                endSustain: 195,
                                endRamp: 225,
                                hue: 0,
                                saturation: -25,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 5,
                                beginRamp: 195,
                                beginSustain: 225,
                                endSustain: 255,
                                endRamp: 285,
                                hue: 0,
                                saturation: -20,
                                lightness: 0
                            },
                            {
                                _obj: "hueSatAdjustmentV2",
                                localRange: 6,
                                beginRamp: 255,
                                beginSustain: 285,
                                endSustain: 315,
                                endRamp: 345,
                                hue: 0,
                                saturation: -4,
                                lightness: 0
                            }
                        ]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Whiten Teeth"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "move",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "previous"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Teeth Whitening"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});

            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    
   
    }, "Teeth Whitening")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnteeth").addEventListener("click", teeth);


/////////////////////////////////////////////////////////////////////////////////////
/////////                        CLIPPING WARNINGS                         /////////
/////////////////////////////////////////////////////////////////////////////////////

async function clippingwarning() {
     
    const docexists = () => {return Boolean(app.documents?.length)}
    const exists = docexists()
         
if (exists === true) {

    suspendHistory(async () => {
        await app.activeDocument.createLayerGroup({ name: "Clipping Warning", opacity: 100 })
        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0])  
            await batchPlay(
                [
                    {
                        _obj: "make",
                        _target: 
                           {
                              _ref: "contentLayer"
                           }
                        ,
                        using: {
                           _obj: "contentLayer",
                           name: "Whites Warning",
                           type: {
                              _obj: "solidColorLayer",
                              color: {
                                 _obj: "RGBColor",
                                 red: 255,
                                 green: 0.0038910505827516317,
                                 blue: 0.0038910505827516317
                              }
                           }
                        },
                        _options: {
                           dialogOptions: "dontDisplay"
                        }
                     },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            blendRange: [{
                                _obj: "blendRange",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "gray"
                                },
                                srcBlackMin: 0,
                                srcBlackMax: 0,
                                srcWhiteMin: 255,
                                srcWhiteMax: 255,
                                destBlackMin: 255,
                                destBlackMax: 255,
                                destWhiteMin: 255,
                                desaturate: 255
                            }],
                            layerEffects: {
                                _obj: "layerEffects",
                                scale: {
                                    _unit: "percentUnit",
                                    _value: 416.6666666666667
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        _target: [
                            { _ref: "contentLayer" }
                        ],
                        using: {
                            _obj: "contentLayer",
                            name: "Blacks Warning",
                            type: {
                                _obj: "solidColorLayer",
                                color: {
                                    _obj: "RGBColor",
                                    red: 0,
                                    green: 0,
                                    blue: 255
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: [
                            { _ref: "layer", _enum: "ordinal", _value: "targetEnum" }
                        ],
                        to: {
                            _obj: "layer",
                            blendRange: [
                                {
                                    _obj: "blendRange",
                                    channel: {
                                        _ref: "channel",
                                        _enum: "channel",
                                        _value: "gray"
                                    },
                                    srcBlackMin: 0,
                                    srcBlackMax: 0,
                                    srcWhiteMin: 255,
                                    srcWhiteMax: 255,
                                    destBlackMin: 0,
                                    destBlackMax: 0,
                                    destWhiteMin: 0,
                                    desaturate: 0
                                }
                            ]
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }
                  
            
                ], {});

    
 
            }, "Clipping Warning")
      
}
else {  
    PhotoshopCore.showAlert({message: '📄 Open an image first'});
}
}
document.getElementById("btnClippingWarning").addEventListener("click", clippingwarning);


/////////////////////////////////////////////////////////////////////////////////////
/////////                         SELECT WET BRUSH                          /////////
/////////////////////////////////////////////////////////////////////////////////////


async function fswetbrush() {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: "select",
                    _target: [{
                        _ref: "wetBrushTool"
                    }],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "wetBrushTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "wetness": 100,
                        "flow": 10,
                        "dryness": 100,
                        "mix": 100,
                        "smooth": 10,
                        "smoothingValue": 26
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 15
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                }
            ], {});
    }, "Wet Brush")
}

document.querySelector("#btnfswetbrush").addEventListener("click", fswetbrush);


/////////////////////////////////////////////////////////////////////////////////////
/////////                      SELECT CLONE BRUSH SHARP                     /////////
/////////////////////////////////////////////////////////////////////////////////////


async function fsclonebrush() {

    suspendHistory(async () => {

      await batchPlay(
            [{
                    _obj: "select",
                    _target: {
                        _ref: "cloneStampTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "cloneStampTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "mode": {
                            "_enum": "blendMode",
                            "_value": "normal"
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "cloneStampTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "opacity": 100,
                        "flow": 100
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 1
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 100
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                }
            ], {});
    }, "Clone Tool")
}

document.querySelector("#btnfsclonebrush").addEventListener("click", fsclonebrush);


/////////////////////////////////////////////////////////////////////////////////////
/////////                   FREQUENCY SEPARATION GAUSSIAN                   /////////
/////////////////////////////////////////////////////////////////////////////////////


async function fsgaussian() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    const getDepth = () => batchPlay(
        [{
            _obj: "get",
            _target: [{
                    _property: "depth"
                },
                {
                    _ref: "document",
                    _enum: "ordinal",
                    _value: "targetEnum"
                }
            ],
        }], {
            synchronousExecution: true
        })[0].depth;

    if (getDepth() === 8) {

        suspendHistory(async () => {

            await app.activeDocument.createLayer({})
            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]); 
            await batchPlay(
                [
                    {
                        _obj: "mergeVisible",
                        duplicate: true,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Low Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        _target: {
                            _ref: "layer"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "mergeVisible",
                        duplicate: true,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "High Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            opacity: {
                                _unit: "percentUnit",
                                _value: 0
                            },
                            layerEffects: {
                                _obj: "layerEffects",
                                scale: {
                                    _unit: "percentUnit",
                                    _value: 333.3333333333333
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "backwardEnum"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "gaussianBlur",
                        radius: {
                            _unit: "pixelsUnit",
                            _value: 4.5
                        },
                        _options: {
                            dialogOptions: "display"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "forwardEnum"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "applyImageEvent",
                        with: {
                            _obj: "calculation",
                            to: {
                                _ref: [{
                                        _ref: "channel",
                                        _enum: "channel",
                                        _value: "RGB"
                                    },
                                    {
                                        _ref: "layer",
                                        _name: "Low Frequency"
                                    }
                                ]
                            },
                            calculation: {
                                _enum: "calculationType",
                                _value: "subtract"
                            },
                            scale: 2,
                            offset: 128
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            opacity: {
                                _unit: "percentUnit",
                                _value: 100
                            },
                            mode: {
                                _enum: "blendMode",
                                _value: "linearLight"
                            },
                            layerEffects: {
                                _obj: "layerEffects",
                                scale: {
                                    _unit: "percentUnit",
                                    _value: 333.3333333333333
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },

                    {
                        _obj: "make",
                        _target: {
                            _ref: "adjustmentLayer"
                        },
                        using: {
                            _obj: "adjustmentLayer",
                            color: {
                                _enum: "color",
                                _value: "green"
                            },
                            type: {
                                _obj: "curves",
                                presetKind: {
                                    _enum: "presetKindType",
                                    _value: "presetKindDefault"
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "adjustmentLayer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindCustom"
                            },
                            adjustment: [{
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "composite"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 38,
                                        vertical: 255
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 103,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 154,
                                        vertical: 253
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 214,
                                        vertical: 1
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            }]
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "hide",
                        "null": [{
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }],
                        "_isCommand": true
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Help Layer"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },


                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "backwardEnum"
                        },
                        selectionModifier: {
                            _enum: "selectionModifierType",
                            _value: "addToSelection"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "backwardEnum"
                        },
                        selectionModifier: {
                            _enum: "selectionModifierType",
                            _value: "addToSelection"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        _target: {
                            _ref: "layerSection"
                        },
                        from: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Frequency Separation Gaussian 8bit"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _name: "Low Frequency"
                        },
                        makeVisible: false,
                        layerID: 64,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: [{
                            _ref: "wetBrushTool"
                        }],
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "wetBrushTool"
                        },
                        "to": {
                            "_obj": "currentToolOptions",
                            "wetness": 100,
                            "flow": 10,
                            "dryness": 100,
                            "mix": 100,
                            "smooth": 10,
                            "smoothingValue": 26
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "brush",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        },
                        "to": {
                            "_obj": "brush",
                            "spacing": {
                                "_unit": "percentUnit",
                                "_value": 15
                            },
                            "hardness": {
                                "_unit": "percentUnit",
                                "_value": 0
                            },
                            "diameter": {
                                "_unit": "pizelsUnit",
                                "_value": 50
                            }
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    }
                ], {});
        }, "Frequency Separation - Gaussian 8bit")


    } else {

        suspendHistory(async () => {

            await app.activeDocument.createLayer({})
            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);   
            await batchPlay(
                [
                    {
                        _obj: "mergeVisible",
                        duplicate: true,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Low Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        _target: {
                            _ref: "layer"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "mergeVisible",
                        duplicate: true,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "High Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            opacity: {
                                _unit: "percentUnit",
                                _value: 0
                            },
                            layerEffects: {
                                _obj: "layerEffects",
                                scale: {
                                    _unit: "percentUnit",
                                    _value: 333.3333333333333
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "backwardEnum"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "gaussianBlur",
                        radius: {
                            _unit: "pixelsUnit",
                            _value: 4.5
                        },
                        _options: {
                            dialogOptions: "display"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "forwardEnum"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "applyImageEvent",
                        with: {
                            _obj: "calculation",
                            to: {
                                _ref: [{
                                        _ref: "channel",
                                        _enum: "channel",
                                        _value: "RGB"
                                    },
                                    {
                                        _ref: "layer",
                                        _name: "Low Frequency"
                                    }
                                ]
                            },
                            invert: true,
                            calculation: {
                                _enum: "calculationType",
                                _value: "add"
                            },
                            scale: 2,
                            offset: 0
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            opacity: {
                                _unit: "percentUnit",
                                _value: 100
                            },
                            mode: {
                                _enum: "blendMode",
                                _value: "linearLight"
                            },
                            layerEffects: {
                                _obj: "layerEffects",
                                scale: {
                                    _unit: "percentUnit",
                                    _value: 333.3333333333333
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },

                    {
                        _obj: "make",
                        _target: {
                            _ref: "adjustmentLayer"
                        },
                        using: {
                            _obj: "adjustmentLayer",
                            color: {
                                _enum: "color",
                                _value: "green"
                            },
                            type: {
                                _obj: "curves",
                                presetKind: {
                                    _enum: "presetKindType",
                                    _value: "presetKindDefault"
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "adjustmentLayer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindCustom"
                            },
                            adjustment: [{
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "composite"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 38,
                                        vertical: 255
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 103,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 154,
                                        vertical: 253
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 214,
                                        vertical: 1
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            }]
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "hide",
                        "null": [{
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }],
                        "_isCommand": true
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Help Layer"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },


                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "backwardEnum"
                        },
                        selectionModifier: {
                            _enum: "selectionModifierType",
                            _value: "addToSelection"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "backwardEnum"
                        },
                        selectionModifier: {
                            _enum: "selectionModifierType",
                            _value: "addToSelection"
                        },
                        makeVisible: false,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        _target: {
                            _ref: "layerSection"
                        },
                        from: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Frequency Separation Gaussian 16bit"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _name: "Low Frequency"
                        },
                        makeVisible: false,
                        layerID: 64,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: [{
                            _ref: "wetBrushTool"
                        }],
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "wetBrushTool"
                        },
                        "to": {
                            "_obj": "currentToolOptions",
                            "wetness": 100,
                            "flow": 10,
                            "dryness": 100,
                            "mix": 100,
                            "smooth": 10,
                            "smoothingValue": 26
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "brush",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        },
                        "to": {
                            "_obj": "brush",
                            "spacing": {
                                "_unit": "percentUnit",
                                "_value": 15
                            },
                            "hardness": {
                                "_unit": "percentUnit",
                                "_value": 0
                            },
                            "diameter": {
                                "_unit": "pizelsUnit",
                                "_value": 50
                            }
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    }
                ], {});
        }, "Frequency Separation - Gaussian 16bit")

    }
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.querySelector("#btnfsgaussian").addEventListener("click", fsgaussian);


/////////////////////////////////////////////////////////////////////////////////////
/////////                     FREQUENCY SEPARATION MEDIAN                   /////////
/////////////////////////////////////////////////////////////////////////////////////


async function fsmedian() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    const getDepth = () => batchPlay(
        [{
            _obj: "get",
            _target: [{
                    _property: "depth"
                },
                {
                    _ref: "document",
                    _enum: "ordinal",
                    _value: "targetEnum"
                }
            ],
        }], {
            synchronousExecution: true
        })[0].depth;

    if (getDepth() === 8) {

        suspendHistory(async () => {

            await batchPlay(
                [

                    {
                        _obj: "make",
                        _target: {
                            _ref: "layerSection"
                        },
                        using: {
                            _obj: "layerSection",
                            name: "Frequency Separation Median 8bit",
                            color: {
                                _enum: "color",
                                _value: "green"
                            }
                        },
                        name: "Group 1",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }
                ], {});

            await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

            await batchPlay([
                    {
                        _obj: "set",
                        _target: {
                            _ref: "channel",
                            _property: "selection"
                        },
                        to: {
                            _enum: "ordinal",
                            _value: "allEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "copyMerged",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "paste",
                        antiAlias: {
                            _enum: "antiAliasType",
                            _value: "antiAliasNone"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Low Frequency Backup"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "newPlacedLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "median",
                        radius: {
                            _unit: "pixelsUnit",
                            _value: 10
                        },
                        _options: {
                            dialogOptions: "display"
                        }
                    },
                    // {
                    //    _obj: "median",
                    //    radius: {
                    //       _unit: "pixelsUnit",
                    //       _value: 10
                    //    },
                    //    _options: {
                    //       dialogOptions: "display"
                    //    }
                    // },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "channel",
                            _property: "selection"
                        },
                        to: {
                            _ref: "channel",
                            _enum: "channel",
                            _value: "transparencyEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "copyToLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Low Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "groupEvent",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "paste",
                        antiAlias: {
                            _enum: "antiAliasType",
                            _value: "antiAliasNone"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "High Frequency Backup"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "applyImageEvent",
                        with: {
                            _obj: "calculation",
                            to: {
                                _ref: [{
                                        _ref: "channel",
                                        _enum: "channel",
                                        _value: "RGB"
                                    },
                                    {
                                        _ref: "layer",
                                        _name: "Low Frequency Backup"
                                    }
                                ]
                            },
                            calculation: {
                                _enum: "calculationType",
                                _value: "subtract"
                            },
                            scale: 2,
                            offset: 128
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            mode: {
                                _enum: "blendMode",
                                _value: "linearLight"
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "copyToLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            mode: {
                                _enum: "blendMode",
                                _value: "normal"
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "High Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "groupEvent",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        _target: {
                            _ref: "adjustmentLayer"
                        },
                        using: {
                            _obj: "adjustmentLayer",
                            color: {
                                _enum: "color",
                                _value: "green"
                            },
                            type: {
                                _obj: "curves",
                                presetKind: {
                                    _enum: "presetKindType",
                                    _value: "presetKindDefault"
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "adjustmentLayer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindCustom"
                            },
                            adjustment: [{
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "composite"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 38,
                                        vertical: 255
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 103,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 154,
                                        vertical: 253
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 214,
                                        vertical: 1
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            }]
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "hide",
                        "null": [{
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }],
                        "_isCommand": true
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Help Layer"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _name: "High Frequency"
                        },
                        makeVisible: false,
                        layerID: 20,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "cloneStampTool"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "cloneStampTool"
                        },
                        "to": {
                            "_obj": "currentToolOptions",
                            "mode": {
                                "_enum": "blendMode",
                                "_value": "normal"
                            }
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "cloneStampTool"
                        },
                        "to": {
                            "_obj": "currentToolOptions",
                            "opacity": 100,
                            "flow": 100
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "brush",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        },
                        "to": {
                            "_obj": "brush",
                            "spacing": {
                                "_unit": "percentUnit",
                                "_value": 1
                            },
                            "hardness": {
                                "_unit": "percentUnit",
                                "_value": 100
                            },
                            "diameter": {
                                "_unit": "pizelsUnit",
                                "_value": 50
                            }
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    }
                ], {});
        }, "Frequency Separation - Median 8bit")
    } else {

        suspendHistory(async () => {

            await batchPlay(
                [

                    {
                        _obj: "make",
                        _target: {
                            _ref: "layerSection"
                        },
                        using: {
                            _obj: "layerSection",
                            name: "Frequency Separation Median 16bit",
                            color: {
                                _enum: "color",
                                _value: "green"
                            }
                        },
                        name: "Group 1",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }
                ], {});
                
                await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    
    
                await batchPlay([
                    {
                        _obj: "set",
                        _target: {
                            _ref: "channel",
                            _property: "selection"
                        },
                        to: {
                            _enum: "ordinal",
                            _value: "allEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "copyMerged",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "paste",
                        antiAlias: {
                            _enum: "antiAliasType",
                            _value: "antiAliasNone"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Low Frequency Backup"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "newPlacedLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "median",
                        radius: {
                            _unit: "pixelsUnit",
                            _value: 10
                        },
                        _options: {
                            dialogOptions: "display"
                        }
                    },
                    // {
                    //    _obj: "median",
                    //    radius: {
                    //       _unit: "pixelsUnit",
                    //       _value: 10
                    //    },
                    //    _options: {
                    //       dialogOptions: "display"
                    //    }
                    // },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "channel",
                            _property: "selection"
                        },
                        to: {
                            _ref: "channel",
                            _enum: "channel",
                            _value: "transparencyEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "copyToLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Low Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "groupEvent",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "paste",
                        antiAlias: {
                            _enum: "antiAliasType",
                            _value: "antiAliasNone"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "High Frequency Backup"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "applyImageEvent",
                        with: {
                            _obj: "calculation",
                            to: {
                                _ref: [{
                                        _ref: "channel",
                                        _enum: "channel",
                                        _value: "RGB"
                                    },
                                    {
                                        _ref: "layer",
                                        _name: "Low Frequency Backup"
                                    }
                                ]
                            },
                            invert: true,
                            calculation: {
                                _enum: "calculationType",
                                _value: "add"
                            },
                            scale: 2,
                            offset: 0
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }


                    ,
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            mode: {
                                _enum: "blendMode",
                                _value: "linearLight"
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "copyToLayer",
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            mode: {
                                _enum: "blendMode",
                                _value: "normal"
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "High Frequency"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "groupEvent",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "make",
                        _target: {
                            _ref: "adjustmentLayer"
                        },
                        using: {
                            _obj: "adjustmentLayer",
                            color: {
                                _enum: "color",
                                _value: "green"
                            },
                            type: {
                                _obj: "curves",
                                presetKind: {
                                    _enum: "presetKindType",
                                    _value: "presetKindDefault"
                                }
                            }
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "adjustmentLayer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindCustom"
                            },
                            adjustment: [{
                                _obj: "curvesAdjustment",
                                channel: {
                                    _ref: "channel",
                                    _enum: "channel",
                                    _value: "composite"
                                },
                                curve: [{
                                        _obj: "point",
                                        horizontal: 0,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 38,
                                        vertical: 255
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 103,
                                        vertical: 0
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 154,
                                        vertical: 253
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 214,
                                        vertical: 1
                                    },
                                    {
                                        _obj: "point",
                                        horizontal: 255,
                                        vertical: 255
                                    }
                                ]
                            }]
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "hide",
                        "null": [{
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }],
                        "_isCommand": true
                    },
                    {
                        _obj: "set",
                        _target: {
                            _ref: "layer",
                            _enum: "ordinal",
                            _value: "targetEnum"
                        },
                        to: {
                            _obj: "layer",
                            name: "Help Layer"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "layer",
                            _name: "High Frequency"
                        },
                        makeVisible: false,
                        layerID: 20,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        _obj: "select",
                        _target: {
                            _ref: "cloneStampTool"
                        },
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "cloneStampTool"
                        },
                        "to": {
                            "_obj": "currentToolOptions",
                            "mode": {
                                "_enum": "blendMode",
                                "_value": "normal"
                            }
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "cloneStampTool"
                        },
                        "to": {
                            "_obj": "currentToolOptions",
                            "opacity": 100,
                            "flow": 100
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    },
                    {
                        "_obj": "set",
                        "_target": {
                            "_ref": "brush",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        },
                        "to": {
                            "_obj": "brush",
                            "spacing": {
                                "_unit": "percentUnit",
                                "_value": 1
                            },
                            "hardness": {
                                "_unit": "percentUnit",
                                "_value": 100
                            },
                            "diameter": {
                                "_unit": "pizelsUnit",
                                "_value": 50
                            }
                        },
                        "_options": {
                            "dialogOptions": "dontDisplay"
                        }
                    }
                ], {});
        }, "Frequency Separation - Median 16bit")

    }
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
document.querySelector("#btnfsmedian").addEventListener("click", fsmedian);

/////////////////////////////////////////////////////////////////////////////////////
/////////                         SELECT LOW FREQUENCY                      /////////
/////////////////////////////////////////////////////////////////////////////////////


async function lowfreq() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    const layerExistsByName = (name) => {return Boolean(app.activeDocument?.layers?.some(layer => layer.name === name))}

    const existsH1 = layerExistsByName("Frequency Separation Gaussian 8bit");
    const existsH2 = layerExistsByName("Frequency Separation Gaussian 16bit");
    const existsH3 = layerExistsByName("Frequency Separation Median 8bit");
    const existsH4 = layerExistsByName("Frequency Separation Median 16bit");

    if  (existsH1 === false & existsH2 === false & existsH3 === false & existsH4 === false){
        PhotoshopCore.showAlert({message: 'Run Median or Gaussian Frequency Separation first'});
    }
else{
    suspendHistory(async () => {

        await batchPlay(
            [

                {
                    _obj: "select",
                    _target: [{
                        _ref: "layer",
                        _name: "Low Frequency"
                    }],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: [{
                        _ref: "wetBrushTool"
                    }],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "wetBrushTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "wetness": 100,
                        "flow": 10,
                        "dryness": 100,
                        "mix": 100,
                        "smooth": 10,
                        "smoothingValue": 26
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 15
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                }
            ], {});
    }, "Low Frequency Selected")
}
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first and run Median or Gaussian Frequency Separation'});}
}
document.querySelector("#btnlowfreq").addEventListener("click", lowfreq);


/////////////////////////////////////////////////////////////////////////////////////
/////////                        SELECT HIGH FREQUENCY                      /////////
/////////////////////////////////////////////////////////////////////////////////////


async function highfreq() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    const layerExistsByName = (name) => {return Boolean(app.activeDocument?.layers?.some(layer => layer.name === name))}

    const existsH1 = layerExistsByName("Frequency Separation Gaussian 8bit");
    const existsH2 = layerExistsByName("Frequency Separation Gaussian 16bit");
    const existsH3 = layerExistsByName("Frequency Separation Median 8bit");
    const existsH4 = layerExistsByName("Frequency Separation Median 16bit");

    if  (existsH1 === false & existsH2 === false & existsH3 === false & existsH4 === false){
        PhotoshopCore.showAlert({message: 'Run Median or Gaussian Frequency Separation first'});
    }
else{
    suspendHistory(async () => {

       await batchPlay(
            [

                {
                    _obj: "select",
                    _target: [{
                        _ref: "layer",
                        _name: "High Frequency"
                    }],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "cloneStampTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "cloneStampTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "mode": {
                            "_enum": "blendMode",
                            "_value": "normal"
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "cloneStampTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "opacity": 100,
                        "flow": 100
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 1
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 100
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                }
            ], {});
    }, "High Frequency Selected")
}
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first and run Median or Gaussian Frequency Separation'});}
}

document.querySelector("#btnhighfreq").addEventListener("click", highfreq);


/////////////////////////////////////////////////////////////////////////////////////
/////////                        DODGE & BURN CURVES                        /////////
/////////////////////////////////////////////////////////////////////////////////////


async function dbcurves() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

await app.activeDocument.createLayerGroup({ name: "DODGE & BURN CURVES", opacity: 100 })
await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0])  

        await batchPlay(
            [
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 100,
                                    vertical: 150
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 255
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "invert",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Dodge"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "hueSaturation",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            colorize: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: {
                            _obj: "hueSatAdjustmentV2",
                            hue: 0,
                            saturation: 20,
                            lightness: 0
                        }

                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "groupEvent",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 150,
                                    vertical: 100
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 255
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "invert",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Burn"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "hueSaturation",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            colorize: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "hueSaturation",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: {
                            _obj: "hueSatAdjustmentV2",
                            hue: 0,
                            saturation: -20,
                            lightness: 0
                        }

                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "groupEvent",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "DODGE & BURN CURVES"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "channelMixer",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            },
                            red: {
                                _obj: "channelMatrix",
                                red: {
                                    _unit: "percentUnit",
                                    _value: 100
                                }
                            },
                            green: {
                                _obj: "channelMatrix",
                                green: {
                                    _unit: "percentUnit",
                                    _value: 100
                                }
                            },
                            blue: {
                                _obj: "channelMatrix",
                                blue: {
                                    _unit: "percentUnit",
                                    _value: 100
                                }
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "channelMixer",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        monochromatic: true,
                        gray: {
                            _obj: "channelMatrix",
                            red: {
                                _unit: "percentUnit",
                                _value: -70
                            },
                            green: {
                                _unit: "percentUnit",
                                _value: 200
                            },
                            blue: {
                                _unit: "percentUnit",
                                _value: -30
                            },
                            constant: {
                                _unit: "percentUnit",
                                _value: 0
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "BW HELP LAYER"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "hide",
                    null: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },

                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Dodge"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },

                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "paintbrushTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "opacity": 2,
                        "flow": 100,
                        "smooth": 10,
                        "smoothingValue": 26
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 10
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Dodge & Burn - Curves")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}
document.querySelector("#btndbcurves").addEventListener("click", dbcurves);

/////////////////////////////////////////////////////////////////////////////////////
/////////                     DODGE & BURN CURVES BRUSH                     /////////
/////////////////////////////////////////////////////////////////////////////////////


async function dbcurvesbrush() {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },

                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "paintbrushTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "opacity": 2,
                        "flow": 100,
                        "smooth": 10,
                        "smoothingValue": 26
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 10
                        },
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 50
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },


            ], {});
    }, "Dodge & Burn Brush")
}
document.querySelector("#btndbcurvesbrush").addEventListener("click", dbcurvesbrush);


/////////////////////////////////////////////////////////////////////////////////////
/////////                     DODGE & BURN GRAY BRUSH                     /////////
/////////////////////////////////////////////////////////////////////////////////////


async function dbgraybrush() {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: "select",
                    _target: {
                        _ref: "dodgeTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },

                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "dodgeTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "exposure": 2,
                        "useLegacy": true
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "dodgeTool"
                    },
                    "to": {
                        "_obj": "currentToolOptions",
                        "mode": {
                            "_enum": "blendMode",
                            "_value": "dodgeM"
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },
                {
                    "_obj": "set",
                    "_target": {
                        "_ref": "brush",
                        "_enum": "ordinal",
                        "_value": "targetEnum"
                    },
                    "to": {
                        "_obj": "brush",
                        "hardness": {
                            "_unit": "percentUnit",
                            "_value": 0
                        },
                        "spacing": {
                            "_unit": "percentUnit",
                            "_value": 15
                        },
                        "diameter": {
                            "_unit": "pizelsUnit",
                            "_value": 25
                        }
                    },
                    "_options": {
                        "dialogOptions": "dontDisplay"
                    }
                },

            ], {});
    }, "Dodge & Burn Brush")
}
document.querySelector("#btndbgraybrush").addEventListener("click", dbgraybrush);




/////////////////////////////////////////////////////////////////////////////////////
/////////                             EYES PLUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function eyeplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRpgBAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cJXPRhc9GAAAAAFkgICBkb3ViP8jwkEAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAMAAAAHZXllU2l6ZWRvdWI/yZmZoAAAAAAAAAtsZWZ0RXllU2l6ZWRvdWI/yZmZoAAAAAAAAAxyaWdodEV5ZVNpemVkb3ViP8mZmaAAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cJXPRhc9GAAAAAFkgICBkb3ViP8jwkEAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAMAAAAHZXllU2l6ZWRvdWI/yZmZoAAAAAAAAAtsZWZ0RXllU2l6ZWRvdWI/yZmZoAAAAAAAAAxyaWdodEV5ZVNpemVkb3ViP8mZmaAAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Eyes +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btneyeplus").addEventListener("click", eyeplus);


/////////////////////////////////////////////////////////////////////////////////////
/////////                            EYES MINUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function eyeminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRpgBAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFbnowuejAAAAAFkgICBkb3ViP8kB/8AAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAMAAAAHZXllU2l6ZWRvdWK/yZmZoAAAAAAAAAtsZWZ0RXllU2l6ZWRvdWK/yZmZoAAAAAAAAAxyaWdodEV5ZVNpemVkb3Viv8mZmaAAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFbnowuejAAAAAFkgICBkb3ViP8kB/8AAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAMAAAAHZXllU2l6ZWRvdWK/yZmZoAAAAAAAAAtsZWZ0RXllU2l6ZWRvdWK/yZmZoAAAAAAAAAxyaWdodEV5ZVNpemVkb3Viv8mZmaAAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Eyes -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btneyeminus").addEventListener("click", eyeminus);


/////////////////////////////////////////////////////////////////////////////////////
/////////                             NOSE PLUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function noseplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRmMBAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFOODj44OAAAAAFkgICBkb3ViP8kD+gAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAJbm9zZVdpZHRoZG91Yj/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFOODj44OAAAAAFkgICBkb3ViP8kD+gAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAJbm9zZVdpZHRoZG91Yj/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Nose +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnnoseplus").addEventListener("click", noseplus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                             NOSE MINUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function noseminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRmMBAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFOODj44OAAAAAFkgICBkb3ViP8kD+gAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAJbm9zZVdpZHRoZG91Yr/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFOODj44OAAAAAFkgICBkb3ViP8kD+gAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAJbm9zZVdpZHRoZG91Yr/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }


            ], {});
    }, "Nose -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnnoseminus").addEventListener("click", noseminus);


/////////////////////////////////////////////////////////////////////////////////////
/////////                            MOUTH PLUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function mouthplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

       await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRq8BAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFGRzcZHOAAAAAFkgICBkb3ViP8j/qQAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAQAAAAIdXBwZXJMaXBkb3ViP8mZmaAAAAAAAAAIbG93ZXJMaXBkb3Viv8mZmaAAAAAAAAAKbW91dGhXaWR0aGRvdWI/uZmZoAAAAAAAAAttb3V0aEhlaWdodGRvdWI/wzMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFGRzcZHOAAAAAFkgICBkb3ViP8j/qQAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAQAAAAIdXBwZXJMaXBkb3ViP8mZmaAAAAAAAAAIbG93ZXJMaXBkb3Viv8mZmaAAAAAAAAAKbW91dGhXaWR0aGRvdWI/uZmZoAAAAAAAAAttb3V0aEhlaWdodGRvdWI/wzMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Mouth +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnmouthplus").addEventListener("click", mouthplus);


/////////////////////////////////////////////////////////////////////////////////////
/////////                            MOUTH MINUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function mouthminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRq8BAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFGRzcZHOAAAAAFkgICBkb3ViP8j/qQAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAQAAAAIdXBwZXJMaXBkb3Viv8mZmaAAAAAAAAAIbG93ZXJMaXBkb3ViP8mZmaAAAAAAAAAKbW91dGhXaWR0aGRvdWK/uZmZoAAAAAAAAAttb3V0aEhlaWdodGRvdWK/wzMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFGRzcZHOAAAAAFkgICBkb3ViP8j/qQAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAQAAAAIdXBwZXJMaXBkb3Viv8mZmaAAAAAAAAAIbG93ZXJMaXBkb3ViP8mZmaAAAAAAAAAKbW91dGhXaWR0aGRvdWK/uZmZoAAAAAAAAAttb3V0aEhlaWdodGRvdWK/wzMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Mouth -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnmouthminus").addEventListener("click", mouthminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            SMILE PLUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function smileplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRl8BAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAFc21pbGVkb3ViP9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAFc21pbGVkb3ViP9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Smile +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsmileplus").addEventListener("click", smileplus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            SMILE MINUS                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function smileminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRl8BAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAFc21pbGVkb3Viv9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAFc21pbGVkb3Viv9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Smile -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsmileminus").addEventListener("click", smileminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          FOREHEAD PLUS                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function foreheadplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRmgBAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAOZm9yZWhlYWRIZWlnaHRkb3ViP9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAOZm9yZWhlYWRIZWlnaHRkb3ViP9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Forehead +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnforeheadplus").addEventListener("click", foreheadplus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          FOREHEAD MINUS                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function foreheadminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAFYFAAAACAAAAAAAAAEAAAAAAAAAAAAAAAAgAABYFQAAAAAAAAAAAAAAIAAAWBUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAVgUAAFYFAABWBQAAZWNhRmgBAAAAAAAAAAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAOZm9yZWhlYWRIZWlnaHRkb3Viv9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/cFPrAp+sDAAAAAFkgICBkb3ViP8j/CgAAAAAAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAOZm9yZWhlYWRIZWlnaHRkb3Viv9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Forehead -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnforeheadminus").addEventListener("click", foreheadminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          JAWLINE PLUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function jawlineplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAG4DAACTBAAAAAAAAAEAAAAAAAAAAAAAAE4SAAC7DQAAAAAAAAAAAABOEgAAuw0AAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABlY2FGYgEAAAAAAAAAAAAQAAAAAQAAAAAACGZhY2VNZXNoAAAAAwAAABVmYWNlRGVzY3JpcHRvclZlcnNpb25sb25nAAAAAgAAAA9mYWNlTWVzaFZlcnNpb25sb25nAAAAAgAAAAxmYWNlSW5mb0xpc3RWbExzAAAAAU9iamMAAAABAAAAAAAIZmFjZUluZm8AAAADAAAACmZhY2VDZW50ZXJPYmpjAAAAAQAAAAAAAG51bGwAAAACAAAAAFggICBkb3ViP96I+2li1NAAAAAAWSAgIGRvdWI/we9n6GZE1gAAAA1mZWF0dXJlVmFsdWVzT2JqYwAAAAEAAAAAAA1mZWF0dXJlVmFsdWVzAAAAAQAAAAhqYXdTaGFwZWRvdWI/0zMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/eiPtpYtTQAAAAAFkgICBkb3ViP8HvZ+hmRNYAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAIamF3U2hhcGVkb3ViP9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Jawline +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnjawlineplus").addEventListener("click", jawlineplus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          JAWLINE MINUS                            /////////
/////////////////////////////////////////////////////////////////////////////////////

async function jawlineminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAG4DAACTBAAAAAAAAAEAAAAAAAAAAAAAAE4SAAC7DQAAAAAAAAAAAABOEgAAuw0AAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABlY2FGYgEAAAAAAAAAAAAQAAAAAQAAAAAACGZhY2VNZXNoAAAAAwAAABVmYWNlRGVzY3JpcHRvclZlcnNpb25sb25nAAAAAgAAAA9mYWNlTWVzaFZlcnNpb25sb25nAAAAAgAAAAxmYWNlSW5mb0xpc3RWbExzAAAAAU9iamMAAAABAAAAAAAIZmFjZUluZm8AAAADAAAACmZhY2VDZW50ZXJPYmpjAAAAAQAAAAAAAG51bGwAAAACAAAAAFggICBkb3ViP96I+2li1NAAAAAAWSAgIGRvdWI/we9n6GZE1gAAAA1mZWF0dXJlVmFsdWVzT2JqYwAAAAEAAAAAAA1mZWF0dXJlVmFsdWVzAAAAAQAAAAhqYXdTaGFwZWRvdWK/0zMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/eiPtpYtTQAAAAAFkgICBkb3ViP8HvZ+hmRNYAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAIamF3U2hhcGVkb3Viv9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Jawline -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnjawlineminus").addEventListener("click", jawlineminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            CHIN PLUS                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function chinplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAG4DAACTBAAAAAAAAAEAAAAAAAAAAAAAAE4SAAC7DQAAAAAAAAAAAABOEgAAuw0AAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABlY2FGZAEAAAAAAAAAAAAQAAAAAQAAAAAACGZhY2VNZXNoAAAAAwAAABVmYWNlRGVzY3JpcHRvclZlcnNpb25sb25nAAAAAgAAAA9mYWNlTWVzaFZlcnNpb25sb25nAAAAAgAAAAxmYWNlSW5mb0xpc3RWbExzAAAAAU9iamMAAAABAAAAAAAIZmFjZUluZm8AAAADAAAACmZhY2VDZW50ZXJPYmpjAAAAAQAAAAAAAG51bGwAAAACAAAAAFggICBkb3ViP96I+2li1NAAAAAAWSAgIGRvdWI/we9n6GZE1gAAAA1mZWF0dXJlVmFsdWVzT2JqYwAAAAEAAAAAAA1mZWF0dXJlVmFsdWVzAAAAAQAAAApjaGluSGVpZ2h0ZG91Yr/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/eiPtpYtTQAAAAAFkgICBkb3ViP8HvZ+hmRNYAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAKY2hpbkhlaWdodGRvdWK/0zMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Chin +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnchinplus").addEventListener("click", chinplus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                           CHIN MINUS                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function chinminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAG4DAACTBAAAAAAAAAEAAAAAAAAAAAAAAE4SAAC7DQAAAAAAAAAAAABOEgAAuw0AAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABlY2FGZAEAAAAAAAAAAAAQAAAAAQAAAAAACGZhY2VNZXNoAAAAAwAAABVmYWNlRGVzY3JpcHRvclZlcnNpb25sb25nAAAAAgAAAA9mYWNlTWVzaFZlcnNpb25sb25nAAAAAgAAAAxmYWNlSW5mb0xpc3RWbExzAAAAAU9iamMAAAABAAAAAAAIZmFjZUluZm8AAAADAAAACmZhY2VDZW50ZXJPYmpjAAAAAQAAAAAAAG51bGwAAAACAAAAAFggICBkb3ViP96I+2li1NAAAAAAWSAgIGRvdWI/we9n6GZE1gAAAA1mZWF0dXJlVmFsdWVzT2JqYwAAAAEAAAAAAA1mZWF0dXJlVmFsdWVzAAAAAQAAAApjaGluSGVpZ2h0ZG91Yj/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/eiPtpYtTQAAAAAFkgICBkb3ViP8HvZ+hmRNYAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAKY2hpbkhlaWdodGRvdWI/0zMzQAAAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50c09iamMAAAABAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHMAAAAA'
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Chin -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnchinminus").addEventListener("click", chinminus);


/////////////////////////////////////////////////////////////////////////////////////
/////////                            FACE PLUS                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function faceplus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAG4DAACTBAAAAAAAAAEAAAAAAAAAAAAAAE4SAAC7DQAAAAAAAAAAAABOEgAAuw0AAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABlY2FGYwEAAAAAAAAAAAAQAAAAAQAAAAAACGZhY2VNZXNoAAAAAwAAABVmYWNlRGVzY3JpcHRvclZlcnNpb25sb25nAAAAAgAAAA9mYWNlTWVzaFZlcnNpb25sb25nAAAAAgAAAAxmYWNlSW5mb0xpc3RWbExzAAAAAU9iamMAAAABAAAAAAAIZmFjZUluZm8AAAADAAAACmZhY2VDZW50ZXJPYmpjAAAAAQAAAAAAAG51bGwAAAACAAAAAFggICBkb3ViP96I+2li1NAAAAAAWSAgIGRvdWI/we9n6GZE1gAAAA1mZWF0dXJlVmFsdWVzT2JqYwAAAAEAAAAAAA1mZWF0dXJlVmFsdWVzAAAAAQAAAAlmYWNlV2lkdGhkb3ViP9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/eiPtpYtTQAAAAAFkgICBkb3ViP8HvZ+hmRNYAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAJZmFjZVdpZHRoZG91Yj/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Face +")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnfaceplus").addEventListener("click", faceplus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            FACE MINUS                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function faceminus() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: '$LqFy',
                    $LqMe: {
                        _rawData: 'base64',
                        _data: 'AAAABHlmcUxoc2VNAgAAAG4DAACTBAAAAAAAAAEAAAAAAAAAAAAAAE4SAAC7DQAAAAAAAAAAAABOEgAAuw0AAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABuAwAAbgMAAG4DAABlY2FGYwEAAAAAAAAAAAAQAAAAAQAAAAAACGZhY2VNZXNoAAAAAwAAABVmYWNlRGVzY3JpcHRvclZlcnNpb25sb25nAAAAAgAAAA9mYWNlTWVzaFZlcnNpb25sb25nAAAAAgAAAAxmYWNlSW5mb0xpc3RWbExzAAAAAU9iamMAAAABAAAAAAAIZmFjZUluZm8AAAADAAAACmZhY2VDZW50ZXJPYmpjAAAAAQAAAAAAAG51bGwAAAACAAAAAFggICBkb3ViP96I+2li1NAAAAAAWSAgIGRvdWI/we9n6GZE1gAAAA1mZWF0dXJlVmFsdWVzT2JqYwAAAAEAAAAAAA1mZWF0dXJlVmFsdWVzAAAAAQAAAAlmYWNlV2lkdGhkb3Viv9MzM0AAAAAAAAAUZmVhdHVyZURpc3BsYWNlbWVudHNPYmpjAAAAAQAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzAAAAAA=='
                    },
                    faceMeshData: {
                        _rawData: 'base64',
                        _data: 'AAAAEAAAAAEAAAAAAAhmYWNlTWVzaAAAAAMAAAAVZmFjZURlc2NyaXB0b3JWZXJzaW9ubG9uZwAAAAIAAAAPZmFjZU1lc2hWZXJzaW9ubG9uZwAAAAIAAAAMZmFjZUluZm9MaXN0VmxMcwAAAAFPYmpjAAAAAQAAAAAACGZhY2VJbmZvAAAAAwAAAApmYWNlQ2VudGVyT2JqYwAAAAEAAAAAAABudWxsAAAAAgAAAABYICAgZG91Yj/eiPtpYtTQAAAAAFkgICBkb3ViP8HvZ+hmRNYAAAANZmVhdHVyZVZhbHVlc09iamMAAAABAAAAAAANZmVhdHVyZVZhbHVlcwAAAAEAAAAJZmFjZVdpZHRoZG91Yr/TMzNAAAAAAAAAFGZlYXR1cmVEaXNwbGFjZW1lbnRzT2JqYwAAAAEAAAAAABRmZWF0dXJlRGlzcGxhY2VtZW50cwAAAAA='
                    },
                    _options: {
                        dialogOptions: 'dontDisplay'
                    }
                }

            ], {});
    }, "Face -")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnfaceminus").addEventListener("click", faceminus);

/////////////////////////////////////////////////////////////////////////////////////
/////////                              POWDER                               /////////
/////////////////////////////////////////////////////////////////////////////////////

async function powder() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {


        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);  

        await batchPlay(
            [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Stamp"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Recover Detail",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "highPass",
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 25
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "softLight"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 60
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "desaturate",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layer"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});


                await PhotoshopCore.showAlert({message: 'In the next step select the skin tone that will be used as Powder.'});

                await batchPlay(
                    [


                {
                    "_obj": "showColorPicker",
                    "context": "General Picker",
                    "application": {
                        "_class": "null"
                    },
                    "value": true,
                    "RGBFloatColor": {
                        "_obj": "RGBColor",
                        "red": 225.99610894941634,
                        "grain": 193.99610894941634,
                        "blue": 173
                    },
                    "dontRecord": true,
                    "forceNotify": true,
                    "_isCommand": true,
                    "_options": {
                        "dialogOptions": "display"
                    }
                },
                {
                    _obj: "fill",
                    using: {
                        _enum: "fillContents",
                        _value: "foregroundColor"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Skin Color"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 45
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "curves",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 191,
                                    vertical: 196
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 237
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "luminosity"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 138,
                                    vertical: 147
                                },
                                {
                                    _obj: "point",
                                    horizontal: 199,
                                    vertical: 207
                                },
                                {
                                    _obj: "point",
                                    horizontal: 212,
                                    vertical: 219
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 230
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 100
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "curves",
                        adjustment: [{
                            _obj: "curvesAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            curve: [{
                                    _obj: "point",
                                    horizontal: 0,
                                    vertical: 0
                                },
                                {
                                    _obj: "point",
                                    horizontal: 140,
                                    vertical: 143
                                },
                                {
                                    _obj: "point",
                                    horizontal: 201,
                                    vertical: 205
                                },
                                {
                                    _obj: "point",
                                    horizontal: 212,
                                    vertical: 216
                                },
                                {
                                    _obj: "point",
                                    horizontal: 255,
                                    vertical: 228
                                }
                            ]
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "surfaceBlur",
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 35
                    },
                    threshold: 20,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Subtle Smoother"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Curves 1"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Matte"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Recover Detail"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Subtle Smoother"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Powder"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 50
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "delete",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },

                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Powder"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },


                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});

    }, "Powder")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnpowder").addEventListener("click", powder);

/////////////////////////////////////////////////////////////////////////////////////
/////////                               GLOW                                /////////
/////////////////////////////////////////////////////////////////////////////////////

async function glow() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
         [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "screen"
                        },
                        blendRange: [{
                            _obj: "blendRange",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "gray"
                            },
                            srcBlackMin: 0,
                            srcBlackMax: 0,
                            srcWhiteMin: 255,
                            srcWhiteMax: 255,
                            destBlackMin: 32,
                            destBlackMax: 255,
                            destWhiteMin: 255,
                            desaturate: 255
                        }],
                        layerEffects: {
                            _obj: "layerEffects",
                            scale: {
                                _unit: "percentUnit",
                                _value: 100
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "brightnessEvent",
                            useLegacy: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "brightnessEvent",
                        brightness: 0,
                        center: 100,
                        useLegacy: false
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 80
                        },
                        mode: {
                            _enum: "blendMode",
                            _value: "luminosity"
                        },
                        blendRange: [{
                            _obj: "blendRange",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "gray"
                            },
                            srcBlackMin: 0,
                            srcBlackMax: 0,
                            srcWhiteMin: 255,
                            srcWhiteMax: 255,
                            destBlackMin: 0,
                            destBlackMax: 0,
                            destWhiteMin: 64,
                            desaturate: 128
                        }],
                        layerEffects: {
                            _obj: "layerEffects",
                            scale: {
                                _unit: "percentUnit",
                                _value: 100
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "backwardEnum"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelection"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    using: {
                        _obj: "layerSection",
                        name: "Glow",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 50
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }


            ], {});
    }, "Glow")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnglow").addEventListener("click", glow);

/////////////////////////////////////////////////////////////////////////////////////
/////////                            LIP BALM                               /////////
/////////////////////////////////////////////////////////////////////////////////////

async function lipbalsam() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
         [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Stamp"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Smoother",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "denoise",
                    colorNoise: {
                        _unit: "percentUnit",
                        _value: 20
                    },
                    sharpen: {
                        _unit: "percentUnit",
                        _value: 25
                    },
                    removeJPEGArtifact: true,
                    channelDenoise: [{
                            _obj: "channelDenoiseParams",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            amount: 10,
                            edgeFidelity: 10
                        },
                        {
                            _obj: "channelDenoiseParams",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "red"
                            },
                            amount: 10,
                            edgeFidelity: 15
                        },
                        {
                            _obj: "channelDenoiseParams",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "green"
                            },
                            amount: 3,
                            edgeFidelity: 21
                        },
                        {
                            _obj: "channelDenoiseParams",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "blue"
                            },
                            amount: 3,
                            edgeFidelity: 20
                        }
                    ],
                    preset: "Default",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "revealAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "duplicate",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    name: "Smoother 2",
                    version: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "dustAndScratches",
                    radius: 3,
                    threshold: 5,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "surfaceBlur",
                    radius: {
                        _unit: "pixelsUnit",
                        _value: 20
                    },
                    threshold: 16,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 35
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "overlay"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "levels",
                        presetKind: {
                            _enum: "presetKindType",
                            _value: "presetKindCustom"
                        },
                        adjustment: [{
                            _obj: "levelsAdjustment",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "composite"
                            },
                            gamma: 1.42
                        }]
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 20
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "RGB"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Gloss"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Smoother"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "layerSection"
                    },
                    from: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Lip Balm"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Stamp"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "delete",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },

                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Lip Balm"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "paintbrushTool"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Lip Balm")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnlipbalsam").addEventListener("click", lipbalsam);


/////////////////////////////////////////////////////////////////////////////////////
/////////                          SKIN TEXTURE                             /////////
/////////////////////////////////////////////////////////////////////////////////////

async function skintexture() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
         [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Enhanced Skin Texture"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "highPass",
                    radius: {
                       _unit: "pixelsUnit",
                       _value: 4
                    },
                    _options: {
                       dialogOptions: "display"
                    }
                 },
                 {
                    _obj: "set",
                    _target: [
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ],
                    to: {
                       _obj: "layer",
                       mode: {
                          _enum: "blendMode",
                          _value: "overlay"
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                 {
                    _obj: "select",
                    _target: [
                       {
                          _ref: "paintbrushTool"
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "blue"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Enhanced Skin Texture")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnenhanceds").addEventListener("click", skintexture);


/////////////////////////////////////////////////////////////////////////////////////
/////////                               BLUSH                               /////////
/////////////////////////////////////////////////////////////////////////////////////

async function blush() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
         [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Blush"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "selectiveColor",
                    presetKind: {
                       _enum: "presetKindType",
                       _value: "presetKindCustom"
                    },
                    method: {
                       _enum: "correctionMethod",
                       _value: "relative"
                    },
                    colorCorrection: [
                       {
                          _obj: "colorCorrection",
                          colors: {
                             _enum: "colors",
                             _value: "radius"
                          },
                          cyan: {
                             _unit: "percentUnit",
                             _value: -5
                          },
                          magenta: {
                             _unit: "percentUnit",
                             _value: 5
                          },
                          yellowColor: {
                             _unit: "percentUnit",
                             _value: 5
                          }
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 
               
                 {
                    _obj: "set",
                    _target: [
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ],
                    to: {
                       _obj: "layer",
                       mode: {
                          _enum: "blendMode",
                          _value: "softLight"
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: [
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ],
                    to: {
                       _obj: "layer",
                       opacity: {
                          _unit: "percentUnit",
                          _value: 40
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },        
                 {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                 {
                    _obj: "select",
                    _target: [
                       {
                          _ref: "paintbrushTool"
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "blue"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Blush")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnblush").addEventListener("click", blush);


/////////////////////////////////////////////////////////////////////////////////////
/////////                              CONTOUR                              /////////
/////////////////////////////////////////////////////////////////////////////////////

async function contour() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
         [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Contour"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "selectiveColor",
                    presetKind: {
                       _enum: "presetKindType",
                       _value: "presetKindCustom"
                    },
                    method: {
                       _enum: "correctionMethod",
                       _value: "relative"
                    },
                    colorCorrection: [
                       {
                          _obj: "colorCorrection",
                          colors: {
                             _enum: "colors",
                             _value: "neutrals"
                          },
                          cyan: {
                             _unit: "percentUnit",
                             _value: 5
                          },
                          magenta: {
                             _unit: "percentUnit",
                             _value: 5
                          },
                          yellowColor: {
                             _unit: "percentUnit",
                             _value: 5
                          },
                          black: {
                             _unit: "percentUnit",
                             _value: 5
                          }
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },        
                 
               
                 {
                    _obj: "set",
                    _target: [
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ],
                    to: {
                       _obj: "layer",
                       mode: {
                          _enum: "blendMode",
                          _value: "multiply"
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: [
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ],
                    to: {
                       _obj: "layer",
                       opacity: {
                          _unit: "percentUnit",
                          _value: 30
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },        
                 {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                 {
                    _obj: "select",
                    _target: [
                       {
                          _ref: "paintbrushTool"
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "blue"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Contour")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btncontour").addEventListener("click", contour);



/////////////////////////////////////////////////////////////////////////////////////
/////////                          HIGHLIGHT                                /////////
/////////////////////////////////////////////////////////////////////////////////////

async function Highlights() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
         [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Highlights"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "selectiveColor",
                    presetKind: {
                       _enum: "presetKindType",
                       _value: "presetKindCustom"
                    },
                    method: {
                       _enum: "correctionMethod",
                       _value: "absolute"
                    },
                    colorCorrection: [
                       {
                          _obj: "colorCorrection",
                          colors: {
                             _enum: "colors",
                             _value: "whites"
                          },
                          cyan: {
                             _unit: "percentUnit",
                             _value: -5
                          },
                          magenta: {
                             _unit: "percentUnit",
                             _value: -5
                          },
                          yellowColor: {
                             _unit: "percentUnit",
                             _value: -5
                          },
                          black: {
                             _unit: "percentUnit",
                             _value: -10
                          }
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: [
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ],
                    to: {
                       _obj: "layer",
                       mode: {
                          _enum: "blendMode",
                          _value: "screen"
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: [
                       {
                          _ref: "layer",
                          _enum: "ordinal",
                          _value: "targetEnum"
                       }
                    ],
                    to: {
                       _obj: "layer",
                       opacity: {
                          _unit: "percentUnit",
                          _value: 40
                       }
                    },
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },        
                 {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                 {
                    _obj: "select",
                    _target: [
                       {
                          _ref: "paintbrushTool"
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "blue"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Highlights")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnhighlights").addEventListener("click", Highlights);

/////////////////////////////////////////////////////////////////////////////////////
/////////                        SMOKEY EYES                                /////////
/////////////////////////////////////////////////////////////////////////////////////

async function smokeyeyes() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {


        await batchPlay(
         [
              
               
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "brightnessEvent",
                            useLegacy: false
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Smokey Eyes"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "adjustmentLayer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "brightnessEvent",
                        brightness: -24
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "multiply"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },    
                  {
                    _obj: "invert",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },

                 {
                    _obj: "select",
                    _target: [
                       {
                          _ref: "paintbrushTool"
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "blue"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Smokey Eyes")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnsmokeyeyes").addEventListener("click", smokeyeyes);


/////////////////////////////////////////////////////////////////////////////////////
/////////                            MASCARA                                /////////
/////////////////////////////////////////////////////////////////////////////////////

async function mascara() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    suspendHistory(async () => {

        await app.activeDocument.createLayer({})

        await app.activeDocument.activeLayers[0].moveAbove(await app.activeDocument.layers[0]);    

        await batchPlay(
         [
                {
                    _obj: "mergeVisible",
                    duplicate: true,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "levels",
                    presetKind: {
                        _enum: "presetKindType",
                        _value: "presetKindCustom"
                    },
                    adjustment: [{
                        _obj: "levelsAdjustment",
                        channel: {
                            _ref: "channel",
                            _enum: "channel",
                            _value: "composite"
                        },
                        input: [
                            80,
                            255
                        ],
                        gamma: 1.8
                    }],
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "luminosity"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 40
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    _target: {
                        _ref: "adjustmentLayer"
                    },
                    using: {
                        _obj: "adjustmentLayer",
                        type: {
                            _obj: "levels",
                            presetKind: {
                                _enum: "presetKindType",
                                _value: "presetKindDefault"
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        mode: {
                            _enum: "blendMode",
                            _value: "multiply"
                        },
                        blendRange: [{
                            _obj: "blendRange",
                            channel: {
                                _ref: "channel",
                                _enum: "channel",
                                _value: "gray"
                            },
                            srcBlackMin: 0,
                            srcBlackMax: 0,
                            srcWhiteMin: 50,
                            srcWhiteMax: 120,
                            destBlackMin: 0,
                            destBlackMax: 0,
                            destWhiteMin: 255,
                            desaturate: 255
                        }],
                        layerEffects: {
                            _obj: "layerEffects",
                            scale: {
                                _unit: "percentUnit",
                                _value: 416.6666666666667
                            }
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "select",
                    _target: {
                        _ref: "layer",
                        _name: "Levels 1"
                    },
                    selectionModifier: {
                        _enum: "selectionModifierType",
                        _value: "addToSelectionContinuous"
                    },
                    makeVisible: false,
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "mergeLayersNew",
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        name: "Mascara"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        opacity: {
                            _unit: "percentUnit",
                            _value: 30
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "make",
                    new: {
                        _class: "channel"
                    },
                    at: {
                        _ref: "channel",
                        _enum: "channel",
                        _value: "mask"
                    },
                    using: {
                        _enum: "userMaskEnabled",
                        _value: "hideAll"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                 {
                    _obj: "select",
                    _target: [
                       {
                          _ref: "paintbrushTool"
                       }
                    ],
                    _options: {
                       dialogOptions: "dontDisplay"
                    }
                 },
                 {
                    _obj: "set",
                    _target: {
                        _ref: "layer",
                        _enum: "ordinal",
                        _value: "targetEnum"
                    },
                    to: {
                        _obj: "layer",
                        color: {
                            _enum: "color",
                            _value: "blue"
                        }
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                },
                {
                    _obj: "reset",
                    _target: {
                        _ref: "color",
                        _property: "colors"
                    },
                    _options: {
                        dialogOptions: "dontDisplay"
                    }
                }
            ], {});
    }, "Mascara")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}
}

document.getElementById("btnmascara").addEventListener("click", mascara);


/////////////////////////////////////////////////////////////////////////////////////
/////////                       CANVAS SIZE PRESETS                          ////////
/////////////////////////////////////////////////////////////////////////////////////


async function applyCanvasPreset(width, height) {
    if (!app.documents.length) {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
        return;
    }

    await suspendHistory(async () => {
        const originalDoc = app.activeDocument;

        // Duplicate the document
        const duplicatedDoc = await originalDoc.duplicate();
        await batchPlay(
            [
               {
                  _obj: "flattenImage",
                  _options: {
                     dialogOptions: "dontDisplay"
                  }
               }
            ],
            {}
         );

        // Calculate scale factor to fit/fill the image into the new canvas
        const originalWidth = duplicatedDoc.width;
        const originalHeight = duplicatedDoc.height;

        // Get selected canvas background color from radio group
        const canvasBgGroup = document.querySelector('#canvasBgColor');
        let selectedColor = 'white';
        const checkedRadio = canvasBgGroup?.querySelector('sp-radio[checked]');
        if (checkedRadio) {
            selectedColor = checkedRadio.value;
        }

        let bgColor = selectedColor === 'white' ? "white" : "black";

        // Get selected placement value ("fit" or "fill")
        const canvasPlacementGroup = document.querySelector('#canvasPlacement');
        let placementValue = 'fit';
        const checkedPlacement = canvasPlacementGroup?.querySelector('sp-radio[checked]');
        if (checkedPlacement) {
            placementValue = checkedPlacement.value;
        }

        // Get margin option
        const canvasMarginGroup = document.querySelector('#canvasMargin');
        let marginEnabled = false;
        const checkedMargin = canvasMarginGroup?.querySelector('sp-radio[checked]');
        if (checkedMargin && checkedMargin.value === 'yes') {
            marginEnabled = true;
        }

        // Apply margin if placement is 'fit' and margin is enabled
        let targetWidth = width;
        let targetHeight = height;
        if (placementValue === 'fit' && marginEnabled) {
            const longerSide = Math.max(width, height);
            const margin = longerSide * 0.05;
            targetWidth -= margin;
            targetHeight -= margin;
        }

        // Update scale factor logic for fit/fill, use margin-adjusted targetWidth/targetHeight if needed
        const scaleFactor = placementValue === 'fill'
            ? Math.max(width / originalWidth, height / originalHeight)
            : Math.min(targetWidth / originalWidth, targetHeight / originalHeight);

        // Resize image proportionally before changing canvas size
        await duplicatedDoc.resizeImage(originalWidth * scaleFactor, originalHeight * scaleFactor);

        // Change the canvas size
        await batchPlay(
            [
               {
                  _obj: "canvasSize",
                  width: {
                     _unit: "pixelsUnit",
                     _value: width
                  },
                  height: {
                    _unit: "pixelsUnit",
                    _value: height
                 },
                  horizontal: {
                     _enum: "horizontalLocation",
                     _value: "center"
                  },
                 vertical: {
                    _enum: "verticalLocation",
                    _value: "center"
                 },
                  canvasExtensionColorType: {
                     _enum: "canvasExtensionColorType",
                     _value: bgColor
                  },
                  _options: {
                     dialogOptions: "dontDisplay"
                  }
               }
            ],
            {}
         );
    }, "Social Media Preparation");
}

document.getElementById("btnCanvasSquare").addEventListener("click", () => {
    applyCanvasPreset(1080, 1080, "Square Canvas");
});

document.getElementById("btnCanvasPortrait").addEventListener("click", () => {
    applyCanvasPreset(1080, 1350, "Portrait Canvas");
});

document.getElementById("btnCanvasStory").addEventListener("click", () => {
    applyCanvasPreset(1080, 1920, "Story Canvas");
});

document.getElementById("btnCanvasLandscape").addEventListener("click", () => {
    applyCanvasPreset(1080,566, "Landscape Canvas");
});

document.getElementById("btnCustomSize").addEventListener("click", () => {
    const width = parseInt(document.getElementById("customWidth").value, 10);
    const height = parseInt(document.getElementById("customHeight").value, 10);
    if (!isNaN(width) && !isNaN(height)) {
        applyCanvasPreset(width, height, "Custom Size");
    } else {
        PhotoshopCore.showAlert({ message: "Please enter valid width and height values." });
    }
});

/////////////////////////////////////////////////////////////////////////////////////
/////////                          FILE INFO                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function fileInfo() {

    const docexists = () => {return Boolean(app.documents?.length)}  
    const exists = docexists()
         
if (exists === true) {

    suspendHistory(async () => {

        await batchPlay(
            [{
                    _obj: "select",
                    _target: {
                        _ref: "menuItemClass",
                        _enum: "menuItemType",
                        _value: "fileInfo"
                       
                    },
                    _options: {
                        dialogOptions: "display"
                    }
                }
            ], {});
    }, "File Info")
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image first'});}

}
document.getElementById("btnFileInfo").addEventListener("click", fileInfo);


/////////////////////////////////////////////////////////////////////////////////////
/////////                             ADD MASK                             /////////
/////////////////////////////////////////////////////////////////////////////////////
async function mask() {

    const docexists = () => { return Boolean(app.documents?.length) }
    const dexists = docexists();

    if (dexists === true) {

        await core.executeAsModal(async () => {

            const activeLayer = app.activeDocument.activeLayers[0];

            // Get real mask state using BatchPlay
            const desc = await batchPlay(
                [{
                    _obj: "get",
                    _target: [{ _ref: "layer", _id: activeLayer.id }],
                    _options: { dialogOptions: "dontDisplay" }
                }],
                {}
            );

            const hasLayerMask = desc[0].hasUserMask ?? false;
        const hasVectorMask = desc[0].hasVectorMask ?? false;

            // If both masks exist — show message, do NOT run make!
            if (hasLayerMask && hasVectorMask) {
                PhotoshopCore.showAlert({ message: "Mask already exist" });

            } else if (!hasLayerMask && !hasVectorMask) {
                // Add pixel mask
                await batchPlay(
                    [{
                        _obj: "make",
                        new: { _class: "channel" },
                        at: { _ref: "channel", _enum: "channel", _value: "mask" },
                        using: { _enum: "userMaskEnabled", _value: "revealAll" },
                        _options: { dialogOptions: "dontDisplay" }
                    }],
                    {}
                );

            } else if (hasLayerMask && !hasVectorMask) {
                // DOUBLE-CHECK vector mask presence — to avoid Make error
                const desc2 = await batchPlay(
                    [{
                        _obj: "get",
                        _target: [{ _ref: "layer", _id: activeLayer.id }],
                        _options: { dialogOptions: "dontDisplay" }
                    }],
                    {}
                );

                const vectorMaskPresent = desc2[0].pathComponentPresent ?? false;

                if (vectorMaskPresent) {
                    PhotoshopCore.showAlert({ message: "Mask already exist" });
                } else {
                    // Safe to make vector mask
                    await batchPlay(
                        [{
                            _obj: "make",
                            _target: [{ _ref: "path" }],
                            at: { _ref: "path", _enum: "path", _value: "vectorMask" },
                            using: { _enum: "vectorMaskEnabled", _value: "revealAll" },
                            _options: { dialogOptions: "dontDisplay" }
                        }],
                        {}
                    );
                }

            } else if (!hasLayerMask && hasVectorMask) {
                // Add pixel mask
                await batchPlay(
                    [{
                        _obj: "make",
                        new: { _class: "channel" },
                        at: { _ref: "channel", _enum: "channel", _value: "mask" },
                        using: { _enum: "userMaskEnabled", _value: "revealAll" },
                        _options: { dialogOptions: "dontDisplay" }
                    }],
                    {}
                );
            }

        });

    } else {
        PhotoshopCore.showAlert({ message: '📄 Open an image first' });
    }
}

document.getElementById("btnmask").addEventListener("click", mask);

/////////////////////////////////////////////////////////////////////////////////////
/////////                                 DELETE                            /////////
/////////////////////////////////////////////////////////////////////////////////////
async function deleteSelected() {

    const docExists = () => { return Boolean(app.documents?.length); };
    const exists = docExists();

    if (!exists) {
        PhotoshopCore.showAlert({ message: "📄 Open an image first." });
        return;
    }

    await core.executeAsModal(async () => {

        const doc = app.activeDocument;
        const activeLayer = doc.activeLayers[0];

        // If only 1 layer in document — cannot delete
        if (doc.layers.length === 1) {
            PhotoshopCore.showAlert({ message: "Cannot delete the only layer in document." });
            return;
        }

    
        // Default: delete layer
        await batchPlay(
            [{
                _obj: "delete",
                _target: [{ _ref: "layer", _id: activeLayer.id }],
                _options: { dialogOptions: "display" }
            }],
            {}
        );

    }, { commandName: "Delete selected" });
}

document.getElementById("btnDelete").addEventListener("click", deleteSelected);
/////////////////////////////////////////////////////////////////////////////////////
/////////                          GENERATIVE FILL                           /////////
/////////////////////////////////////////////////////////////////////////////////////
async function generativeFill() {
    // Check if document exists
    if (!app.documents?.length) {
        PhotoshopCore.showAlert({message: '📄 Open an image first'});
        return;
    }
    
    try {
        // Check for selection
        const result = await batchPlay([{
            _obj: "get",
            _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
            _options: { dialogOptions: "dontDisplay" }
        }], { synchronousExecution: true });

        const doc = result[0];
        
        // Check if selection exists
        if (!doc.selection) {
            PhotoshopCore.showAlert({
                message: '🎯 Please make a selection first.\n\nGenerative Fill requires a pixel selection to work.'
            });
            return;
        }
        
        // Optional: Additional validation for selection bounds if needed
        if (doc.selection.bounds) {
            const bounds = doc.selection.bounds;
            const width = bounds.right._value - bounds.left._value;
            const height = bounds.bottom._value - bounds.top._value;
            
            if (width <= 0 || height <= 0) {
                PhotoshopCore.showAlert({
                    message: '🎯 Invalid selection detected.\n\nPlease make a proper pixel selection.'
                });
                return;
            }
        }
        
        // All checks passed - execute Generative Fill
        await core.executeAsModal(() => {
            const psCore = require('photoshop').core;
            psCore.performMenuCommand({"commandID": 1750});
        });
        
    } catch (error) {
        console.error('Selection check error:', error);
        PhotoshopCore.showAlert({
            message: '🎯 Please make a selection first.\n\nGenerative Fill requires a pixel selection to work.'
        });
    }
}

document.getElementById("btngenerativeFill").addEventListener("click", generativeFill);

/////////////////////////////////////////////////////////////////////////////////////
/////////                          GENERATE IMAGE                           /////////
/////////////////////////////////////////////////////////////////////////////////////

async function generateImage() {

    const docexists = () => {return Boolean(app.documents?.length)}
    const dexists = docexists()
      
if (dexists === true) {

    await core.executeAsModal(() => {

    const psCore = require('photoshop').core;
    psCore.performMenuCommand({"commandID": 1771});
})
}
else {  PhotoshopCore.showAlert({message: '📄 Open an image or create a new canvas first'});}
}
document.getElementById("btngenerateImage").addEventListener("click", generateImage);

//------------------------------------------END---------------------------------------------//
});