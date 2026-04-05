// ============================================================
//  SOLID INVENTORY — GOOGLE APPS SCRIPT
//  Web App = Input only | Google Sheets = Brain
// ============================================================

const SPREADSHEET_ID = "1NT1GYRvozAsUroixl5oDLlEWUw6a7XsoLQSxwvy0h7I";

const SHEETS = {
  products  : "Master_Data",
  opening   : "Opening_Inventory",
  activity  : "Transactions",
  closing   : "Closing_Inventory",
  dashboard : "Financial_Dashboard"
};

function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle("Solid Inventory")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
//  HELPER — Find next truly empty row
// ============================================================
function findNextEmptyRow(sheet, checkColumn, startRow) {
  const data = sheet.getRange(startRow, checkColumn, 2000, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === "" || data[i][0] === null) {
      return startRow + i;
    }
  }
  return startRow + data.length;
}

// ============================================================
//  ADD PRODUCT
//  Writes: B=Name, C=Category, D=Unit, E=CostPrice, F=SellingPrice
//  Sheet handles: A=ProductID (formula)
// ============================================================
function addProduct(data) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName(SHEETS.products);
    const nextRow = findNextEmptyRow(sheet, 2, 5);

    sheet.getRange(nextRow, 2).setValue(data.productName);
    sheet.getRange(nextRow, 3).setValue(data.category);
    sheet.getRange(nextRow, 4).setValue(data.unit);
    sheet.getRange(nextRow, 5).setValue(Number(data.costPrice));
    sheet.getRange(nextRow, 6).setValue(Number(data.sellingPrice));

    SpreadsheetApp.flush();
    const productId = sheet.getRange(nextRow, 1).getValue();

    return {
      status  : "success",
      message : "✅ Product added!",
      id      : productId
    };
  } catch (e) {
    return { status: "error", message: "❌ " + e.message };
  }
}

// ============================================================
//  OPENING STOCK
//  Writes: A=Date, B=ProductID, E=OpeningQty, F=ReceivedQty
//  Sheet handles: C=Name, D=Unit, G=Total, H=CostPrice, I=Value
// ============================================================
function addOpeningStock(data) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName(SHEETS.opening);
    const nextRow = findNextEmptyRow(sheet, 2, 5);

    const dateStamp = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy"
    );

    sheet.getRange(nextRow, 1).setValue(dateStamp);
    sheet.getRange(nextRow, 2).setValue(data.productId);
    sheet.getRange(nextRow, 5).setValue(Number(data.openingQty)  || 0);
    sheet.getRange(nextRow, 6).setValue(Number(data.receivedQty) || 0);

    return { status: "success", message: "✅ Opening stock recorded!" };
  } catch (e) {
    return { status: "error", message: "❌ " + e.message };
  }
}

// ============================================================
//  DAILY ACTIVITY
//  Writes: A=Date, C=Type, D=ProductID, G=Qty,
//          J=CustomerName, L=DueDate, M=PaymentStatus
//  Sheet handles: B=TxnNo, E=Name, F=Unit, H=UnitPrice,
//                 I=TotalAmount, K=AmountOwed
// ============================================================
function addTransaction(data) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName(SHEETS.activity);
    const nextRow = findNextEmptyRow(sheet, 4, 5);

    const dateStamp = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy"
    );

    const isCredit = data.transactionType === "Credit Sales";

    sheet.getRange(nextRow, 1).setValue(dateStamp);
    sheet.getRange(nextRow, 3).setValue(data.transactionType);
    sheet.getRange(nextRow, 4).setValue(data.productId);
    sheet.getRange(nextRow, 7).setValue(Number(data.qty) || 0);
    sheet.getRange(nextRow, 10).setValue(isCredit ? data.customerName  : "");
    sheet.getRange(nextRow, 12).setValue(isCredit ? data.dueDate       : "");
    sheet.getRange(nextRow, 13).setValue(isCredit ? data.paymentStatus : "");

    SpreadsheetApp.flush();
    const txnNumber = sheet.getRange(nextRow, 2).getValue();

    return {
      status      : "success",
      message     : "✅ Transaction recorded!",
      transaction : txnNumber
    };
  } catch (e) {
    return { status: "error", message: "❌ " + e.message };
  }
}

// ============================================================
//  PAYMENT COLLECTION
//  Finds transaction by TxnNo (Column B)
//  Updates: K=AmountOwed, M=PaymentStatus, N=AuditTrail
// ============================================================
function recordPayment(data) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName(SHEETS.activity);
    const allData = sheet.getDataRange().getValues();

    let rowIndex = -1;
    for (let i = 4; i < allData.length; i++) {
      if (String(allData[i][1]) === String(data.txnNumber)) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      return { status: "error", message: "❌ Transaction not found" };
    }

    const currentOwed = Number(allData[rowIndex - 1][10]) || 0;
    const amountPaid  = Number(data.amountPaid) || 0;

    if (amountPaid <= 0) {
      return { status: "error", message: "❌ Amount must be greater than zero" };
    }
    if (amountPaid > currentOwed) {
      return {
        status  : "error",
        message : "❌ Payment ₦" + amountPaid.toLocaleString() +
                  " exceeds balance ₦" + currentOwed.toLocaleString()
      };
    }

    const newOwed   = currentOwed - amountPaid;
    const newStatus = newOwed === 0 ? "🟢 PAID" : "🔴 UNPAID";
    const auditDate = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy HH:mm"
    );

    sheet.getRange(rowIndex, 11).setValue(newOwed);
    sheet.getRange(rowIndex, 13).setValue(newStatus);
    sheet.getRange(rowIndex, 14).setValue(
      "Paid ₦" + amountPaid.toLocaleString() + " on " + auditDate
    );

    return {
      status      : "success",
      message     : "✅ Payment of ₦" + amountPaid.toLocaleString() + " recorded!",
      balanceLeft : newOwed,
      newStatus   : newStatus
    };
  } catch (e) {
    return { status: "error", message: "❌ " + e.message };
  }
}

// ============================================================
//  GET PRODUCTS — Powers dropdowns
// ============================================================
function getProducts() {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName(SHEETS.products);
    const allData = sheet.getDataRange().getValues();
    const products = [];

    for (let i = 4; i < allData.length; i++) {
      if (allData[i][1] !== "" && allData[i][1] !== null) {
        products.push({
          id       : String(allData[i][0]),
          name     : String(allData[i][1]),
          unit     : String(allData[i][3]),
          category : String(allData[i][2])
        });
      }
    }
    return { status: "success", products: products };
  } catch (e) {
    return { status: "error", message: "❌ " + e.message };
  }
}

// ============================================================
//  GET UNPAID TRANSACTIONS — Payment form dropdown
// ============================================================
function getUnpaidTransactions() {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName(SHEETS.activity);
    const allData = sheet.getDataRange().getValues();
    const unpaid  = [];

    for (let i = 4; i < allData.length; i++) {
      const txnNo      = String(allData[i][1]  || "");
      const txnType    = String(allData[i][2]  || "");
      const amountOwed = Number(allData[i][10]) || 0;
      const isCredit   = txnType === "Credit Sales" || txnType === "Credit Sale";

      if (isCredit && amountOwed > 0 && txnNo !== "") {
        unpaid.push({
          txnNumber    : txnNo,
          customerName : String(allData[i][9]  || "Unknown"),
          productName  : String(allData[i][4]  || ""),
          amountOwed   : amountOwed,
          dueDate      : String(allData[i][11] || "")
        });
      }
    }
    return { status: "success", unpaid: unpaid };
  } catch (e) {
    return { status: "error", message: "❌ " + e.message };
  }
}

// ============================================================
//  GET DASHBOARD — Reads directly from Financial_Dashboard sheet
// ============================================================
function getDashboard() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.dashboard);

    // Read exact cells from Financial_Dashboard
    const B5  = Number(sheet.getRange("B5").getValue())  || 0;  // Cash Sales
    const B6  = Number(sheet.getRange("B6").getValue())  || 0;  // Credit Sales
    const B7  = Number(sheet.getRange("B7").getValue())  || 0;  // Total Revenue
    const B8  = Number(sheet.getRange("B8").getValue())  || 0;  // COGS
    const B9  = Number(sheet.getRange("B9").getValue())  || 0;  // Gross Profit
    const B10 = Number(sheet.getRange("B10").getValue()) || 0;  // Gross Profit Margin
    const E5  = Number(sheet.getRange("E5").getValue())  || 0;  // Opening Stock Value
    const E6  = Number(sheet.getRange("E6").getValue())  || 0;  // New Stock Received
    const E7  = Number(sheet.getRange("E7").getValue())  || 0;  // Closing Stock Value
    const E8  = Number(sheet.getRange("E8").getValue())  || 0;  // Change in Inventory
    const E9  = Number(sheet.getRange("E9").getValue())  || 0;  // Units Sold
    const E10 = Number(sheet.getRange("E10").getValue()) || 0;  // Products Tracked
    const E14 = Number(sheet.getRange("E14").getValue()) || 0;  // Outstanding Receivables
    const E15 = Number(sheet.getRange("E15").getValue()) || 0;  // Total Current Assets
    const E17 = Number(sheet.getRange("E17").getValue()) || 0;  // Net Working Capital

    return {
      status              : "success",
      cashSales           : B5,
      creditSales         : B6,
      totalRevenue        : B7,
      cogs                : B8,
      grossProfit         : B9,
      grossProfitMargin   : B10,
      openingStockValue   : E5,
      newStockReceived    : E6,
      closingStockValue   : E7,
      changeInInventory   : E8,
      unitsSold           : E9,
      productsTracked     : E10,
      outstandingReceivables : E14,
      totalCurrentAssets  : E15,
      netWorkingCapital   : E17
    };
  } catch (e) {
    return { status: "error", message: "❌ " + e.message };
  }
}

// ============================================================
//  MASTER HANDLER
// ============================================================
function handleRequest(action, data) {
  switch (action) {
    case "addProduct"            : return addProduct(data);
    case "addOpeningStock"       : return addOpeningStock(data);
    case "addTransaction"        : return addTransaction(data);
    case "recordPayment"         : return recordPayment(data);
    case "getProducts"           : return getProducts();
    case "getUnpaidTransactions" : return getUnpaidTransactions();
    case "getDashboard"          : return getDashboard();
    default:
      return { status: "error", message: "❌ Unknown action: " + action };
  }
}
