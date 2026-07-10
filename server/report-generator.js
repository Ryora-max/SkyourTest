const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

class ReportGenerator {
  constructor() {
    this.reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateExcel(run) {
    const { results, summary, url, browser, startTime, endTime, id } = run;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SkyourTest QC Automation';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.company = 'SkyourTest';

    // ===== Sheet 1: Cover =====
    const coverSheet = workbook.addWorksheet('Cover', {
      properties: { tabColor: { argb: 'FF1E40AF' } },
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    });

    coverSheet.columns = [{ width: 5 }, { width: 25 }, { width: 40 }, { width: 5 }];

    coverSheet.mergeCells('B2:C2');
    const bannerCell = coverSheet.getCell('B2');
    bannerCell.value = 'SkyourTest';
    bannerCell.font = { size: 28, bold: true, color: { argb: 'FFFFFFFF' } };
    bannerCell.alignment = { vertical: 'middle', horizontal: 'center' };
    bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    coverSheet.getRow(2).height = 50;

    coverSheet.mergeCells('B3:C3');
    const subBanner = coverSheet.getCell('B3');
    subBanner.value = 'LAPORAN QC AUTOMATION TEST';
    subBanner.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    subBanner.alignment = { vertical: 'middle', horizontal: 'center' };
    subBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    coverSheet.getRow(3).height = 30;

    coverSheet.getRow(4).height = 15;

    const infoItems = [
      { label: 'ID Laporan', value: id.substring(0, 8).toUpperCase() },
      { label: 'URL Target', value: url },
      { label: 'Browser', value: browser.charAt(0).toUpperCase() + browser.slice(1) },
      { label: 'Tanggal Tes', value: new Date(startTime).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
      { label: 'Waktu Mulai', value: new Date(startTime).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' },
      { label: 'Waktu Selesai', value: endTime ? new Date(endTime).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : 'N/A' },
      { label: 'Total Durasi', value: summary ? `${(summary.totalDuration / 1000).toFixed(2)} detik` : 'N/A' },
      { label: 'Status Tes', value: run.status.toUpperCase() },
    ];

    let row = 5;
    infoItems.forEach(item => {
      const labelCell = coverSheet.getCell(`B${row}`);
      const valueCell = coverSheet.getCell(`C${row}`);
      labelCell.value = item.label;
      valueCell.value = item.value;
      labelCell.font = { bold: true, size: 11, color: { argb: 'FF1E40AF' } };
      valueCell.font = { size: 11, color: { argb: 'FF1F2937' } };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      labelCell.border = this.getBorder();
      valueCell.border = this.getBorder();
      valueCell.alignment = { vertical: 'middle', wrapText: true };
      coverSheet.getRow(row).height = 22;
      row++;
    });

    row++;
    coverSheet.getRow(row).height = 10;
    row++;

    if (summary) {
      coverSheet.mergeCells(`B${row}:C${row}`);
      const summaryTitle = coverSheet.getCell(`B${row}`);
      summaryTitle.value = 'RINGKASAN EKSEKUSI';
      summaryTitle.font = { size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      summaryTitle.alignment = { vertical: 'middle', horizontal: 'center' };
      summaryTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      coverSheet.getRow(row).height = 28;
      row++;

      const summaryItems = [
        { label: 'Total Test Case', value: summary.total, color: 'FF1F2937' },
        { label: 'Lulus', value: summary.passed, color: 'FF16A34A' },
        { label: 'Gagal', value: summary.failed, color: 'FFDC2626' },
        { label: 'Catatan (Best Practice)', value: summary.notes || 0, color: 'FFCA8A04' },
        { label: 'Tingkat Kelulusan', value: `${summary.passRate}%`, color: summary.passRate >= 90 ? 'FF16A34A' : summary.passRate >= 70 ? 'FFCA8A04' : 'FFDC2626' },
      ];

      summaryItems.forEach(item => {
        const labelCell = coverSheet.getCell(`B${row}`);
        const valueCell = coverSheet.getCell(`C${row}`);
        labelCell.value = item.label;
        valueCell.value = item.value;
        labelCell.font = { bold: true, size: 11 };
        valueCell.font = { bold: true, size: 12, color: { argb: item.color } };
        labelCell.border = this.getBorder();
        valueCell.border = this.getBorder();
        labelCell.alignment = { vertical: 'middle' };
        valueCell.alignment = { vertical: 'middle', horizontal: 'center' };
        coverSheet.getRow(row).height = 22;
        row++;
      });

      row++;
      coverSheet.mergeCells(`B${row}:C${row}`);
      const rateBar = coverSheet.getCell(`B${row}`);
      const rate = summary.passRate;
      let barText = '';
      const filled = Math.round(rate / 10);
      for (let i = 0; i < 10; i++) barText += i < filled ? '█' : '░';
      rateBar.value = `${barText}  ${rate}%`;
      rateBar.font = { size: 14, bold: true, color: { argb: rate >= 90 ? 'FF16A34A' : rate >= 70 ? 'FFCA8A04' : 'FFDC2626' } };
      rateBar.alignment = { vertical: 'middle', horizontal: 'center' };
      coverSheet.getRow(row).height = 28;
      row += 2;

      coverSheet.mergeCells(`B${row}:C${row}`);
      const modTitle = coverSheet.getCell(`B${row}`);
      modTitle.value = 'HASIL PER MODUL';
      modTitle.font = { size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      modTitle.alignment = { vertical: 'middle', horizontal: 'center' };
      modTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      coverSheet.getRow(row).height = 28;
      row++;

      const modHeaders = ['Modul', 'Hasil'];
      ['B', 'C'].forEach((col, i) => {
        const cell = coverSheet.getCell(`${col}${row}`);
        cell.value = modHeaders[i];
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = this.getBorder();
      });
      row++;

      const coverModNames = {
        accessibility: 'Aksesibilitas', login: 'Login', navigation: 'Navigasi',
        security: 'Keamanan', performance: 'Performa', responsive: 'Responsif',
        form_validation: 'Validasi Form', menu_traversal: 'Menu Traversal',
        api_response: 'API Response', cookie_session: 'Cookie & Session', content_seo: 'Content & SEO',
        dashboard: 'Dashboard', crud: 'CRUD', payment: 'Payment', camera: 'Camera',
        multi_role: 'Multi-Role', file_upload: 'File Upload', email_notif: 'Email & Notif', booking: 'Booking',
      };
      Object.entries(summary.modules).forEach(([mod, data]) => {
        const rate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(0) : '0';
        const modCell = coverSheet.getCell(`B${row}`);
        const resultCell = coverSheet.getCell(`C${row}`);
        modCell.value = coverModNames[mod] || mod;
        resultCell.value = `${data.passed}/${data.total} lulus (${rate}%)`;
        modCell.font = { size: 10, bold: true };
        resultCell.font = { size: 10, color: { argb: rate >= 80 ? 'FF16A34A' : rate >= 50 ? 'FFCA8A04' : 'FFDC2626' } };
        modCell.border = this.getBorder();
        resultCell.border = this.getBorder();
        modCell.alignment = { vertical: 'middle' };
        resultCell.alignment = { vertical: 'middle', horizontal: 'center' };
        coverSheet.getRow(row).height = 20;
        row++;
      });
    }

    row += 2;
    coverSheet.mergeCells(`B${row}:C${row}`);
    const footer = coverSheet.getCell(`B${row}`);
    footer.value = `Dibuat oleh SkyourTest QC Automation pada ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
    footer.font = { size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
    footer.alignment = { vertical: 'middle', horizontal: 'center' };

    // ===== Sheet 2: Detail Test Cases =====
    const detailSheet = workbook.addWorksheet('Detail Test Cases', {
      properties: { tabColor: { argb: 'FF2563EB' } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToWidth: true },
    });

    // Kolom: No, Modul, Scenario, Pre-Conditions, Test Steps, Expected Result, Actual Result, Test Date, Status, Remark/Attachment, Development Fixing
    const headers = ['No', 'Modul', 'Scenario', 'Pre-Conditions', 'Test Steps', 'Expected Result', 'Actual Result', 'Test Date', 'Status', 'Category', 'Remark / Attachment', 'Development Fixing'];

    headers.forEach((h, i) => {
      const cell = detailSheet.getRow(1).getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = this.getBorder();
    });
    detailSheet.getRow(1).height = 35;

    const modNames = {
      accessibility: 'Aksesibilitas', login: 'Login', navigation: 'Navigasi',
      security: 'Keamanan', performance: 'Performa', responsive: 'Responsif',
      form_validation: 'Validasi Form', menu_traversal: 'Menu Traversal',
      api_response: 'API Response', cookie_session: 'Cookie & Session', content_seo: 'Content & SEO',
      dashboard: 'Dashboard', crud: 'CRUD', payment: 'Payment', camera: 'Camera',
      multi_role: 'Multi-Role', file_upload: 'File Upload', email_notif: 'Email & Notif', booking: 'Booking',
    };

    results.forEach((r, i) => {
      const rowNum = i + 2;
      const row = detailSheet.getRow(rowNum);

      const testDate = new Date(r.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const statusText = r.status === 'passed' ? 'LULUS' : r.status === 'note' ? 'CATATAN' : 'GAGAL';
      const categoryText = r.category === 'optional' ? 'Opsional' : 'Primary';
      const remark = r.status === 'note'
        ? (r.actual ? `Catatan: ${r.actual}` : 'Catatan (tidak wajib)')
        : r.error ? `Error: ${r.error}` : (r.status === 'passed' ? 'Tes berhasil' : 'Tes gagal');
      const devFixing = r.status === 'failed'
        ? `Perlu perbaikan: ${r.title}. ${r.error || ''}`
        : r.status === 'note' ? 'Catatan (best-practice, tidak wajib)' : 'Tidak perlu perbaikan';

      const values = [
        i + 1,
        modNames[r.module] || r.module,
        r.title,
        r.preConditions || '-',
        r.testSteps || '-',
        r.expected || '-',
        r.actual || '-',
        testDate,
        statusText,
        categoryText,
        remark,
        devFixing,
      ];

      values.forEach((v, j) => {
        const cell = row.getCell(j + 1);
        cell.value = v;
        cell.border = this.getBorder();
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.font = { size: 9 };
      });

      // Color status
      const statusCell = row.getCell(9);
      if (r.status === 'passed') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        statusCell.font = { bold: true, size: 9, color: { argb: 'FF16A34A' } };
      } else if (r.status === 'note') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        statusCell.font = { bold: true, size: 9, color: { argb: 'FFCA8A04' } };
      } else if (r.status === 'failed') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        statusCell.font = { bold: true, size: 9, color: { argb: 'FFDC2626' } };
      }
      statusCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Category cell
      const catCell = row.getCell(10);
      catCell.value = categoryText;
      if (r.category === 'optional') {
        catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        catCell.font = { size: 9, color: { argb: 'FF64748B' } };
      } else {
        catCell.font = { size: 9, color: { argb: 'FF1E40AF' } };
      }
      catCell.alignment = { vertical: 'middle', horizontal: 'center' };
      catCell.border = this.getBorder();

      // Alternate row
      if (i % 2 === 0) {
        for (let k = 1; k <= 12; k++) {
          if (k !== 9 && k !== 10) {
            row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        }
      }

      detailSheet.getRow(rowNum).height = 60;
    });

    const colWidths = [5, 14, 28, 25, 40, 30, 35, 20, 10, 10, 30, 35];
    colWidths.forEach((w, i) => detailSheet.getColumn(i + 1).width = w);

    detailSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: results.length + 1, column: headers.length },
    };
    detailSheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ===== Sheet 3: Test Gagal =====
    const failedSheet = workbook.addWorksheet('Test Gagal', {
      properties: { tabColor: { argb: 'FFDC2626' } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToWidth: true },
    });

    const failedResults = results.filter(r => r.status === 'failed');
    const failedHeaders = ['Test ID', 'Modul', 'Scenario', 'Pre-Conditions', 'Test Steps', 'Expected Result', 'Actual Result', 'Error', 'Category', 'Development Fixing'];

    failedHeaders.forEach((h, i) => {
      const cell = failedSheet.getRow(1).getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = this.getBorder();
    });
    failedSheet.getRow(1).height = 30;

    if (failedResults.length === 0) {
      failedSheet.mergeCells('A2:I2');
      const cell = failedSheet.getCell('A2');
      cell.value = 'SEMUA TES LULUS - TIDAK ADA TEST YANG GAGAL';
      cell.font = { bold: true, color: { argb: 'FF16A34A' }, size: 14 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      failedSheet.getRow(2).height = 50;
    } else {
      failedResults.forEach((r, i) => {
        const rowNum = i + 2;
        const row = failedSheet.getRow(rowNum);
        const devFix = `Perlu perbaikan: ${r.title}. Error: ${r.error}`;
        const values = [
          r.testId, modNames[r.module] || r.module, r.title,
          r.preConditions || '-', r.testSteps || '-',
          r.expected || '-', r.actual || '-',
          r.error || '-', r.category === 'optional' ? 'Opsional' : 'Primary', devFix,
        ];
        values.forEach((v, j) => {
          const cell = row.getCell(j + 1);
          cell.value = v;
          cell.border = this.getBorder();
          cell.alignment = { vertical: 'top', wrapText: true };
          cell.font = { size: 9 };
        });

        failedSheet.getRow(rowNum).height = 60;
      });
    }

    [13, 13, 30, 22, 35, 28, 32, 35, 10, 40].forEach((w, i) => failedSheet.getColumn(i + 1).width = w);

    // ===== Sheet 4: Ringkasan Modul =====
    const moduleSheet = workbook.addWorksheet('Ringkasan Modul', {
      properties: { tabColor: { argb: 'FF16A34A' } },
    });

    moduleSheet.columns = [{ width: 5 }, { width: 22 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 15 }];

    moduleSheet.mergeCells('B2:F2');
    const modTitle = moduleSheet.getCell('B2');
    modTitle.value = 'HASIL TES PER MODUL';
    modTitle.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    modTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    modTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
    moduleSheet.getRow(2).height = 30;

    const modHeaders = ['', 'Modul', 'Total', 'Lulus', 'Gagal', 'Catatan', 'Tingkat Lulus'];
    modHeaders.forEach((h, i) => {
      if (i === 0) return;
      const cell = moduleSheet.getRow(4).getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = this.getBorder();
    });
    moduleSheet.getRow(4).height = 25;

    if (summary) {
      Object.entries(summary.modules).forEach(([mod, data], i) => {
        const rowNum = 5 + i;
        const rate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : '0';
        const values = ['', modNames[mod] || mod, data.total, data.passed, data.failed, data.notes || 0, `${rate}%`];
        values.forEach((v, j) => {
          if (j === 0) return;
          const cell = moduleSheet.getRow(rowNum).getCell(j + 1);
          cell.value = v;
          cell.border = this.getBorder();
          cell.alignment = { vertical: 'middle', horizontal: j === 1 ? 'left' : 'center' };
          cell.font = { size: 10 };
        });

        const rateCell = moduleSheet.getRow(rowNum).getCell(7);
        const rateNum = parseFloat(rate);
        if (rateNum >= 80) {
          rateCell.font = { bold: true, color: { argb: 'FF16A34A' } };
          rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        } else if (rateNum >= 50) {
          rateCell.font = { bold: true, color: { argb: 'FFCA8A04' } };
          rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        } else {
          rateCell.font = { bold: true, color: { argb: 'FFDC2626' } };
          rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        }

        moduleSheet.getRow(rowNum).height = 22;
      });

      const totalRow = 5 + Object.keys(summary.modules).length;
      const totalValues = ['', 'TOTAL', summary.total, summary.passed, summary.failed, summary.notes || 0, `${summary.passRate}%`];
      totalValues.forEach((v, j) => {
        if (j === 0) return;
        const cell = moduleSheet.getRow(totalRow).getCell(j + 1);
        cell.value = v;
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
        cell.alignment = { vertical: 'middle', horizontal: j === 1 ? 'left' : 'center' };
        cell.border = this.getBorder();
      });
      moduleSheet.getRow(totalRow).height = 25;
    }

    // ===== Save =====
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `SkyourTest-Laporan-${dateStr}-${id.substring(0, 8)}.xlsx`;
    const filePath = path.join(this.reportsDir, fileName);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  getBorder() {
    return {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
  }
}

module.exports = ReportGenerator;
