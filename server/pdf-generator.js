const PDFDocument = require('pdfkit');
const { Writable } = require('stream');

class PdfGenerator {
  generateReport(run) {
    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 60, bottom: 60, left: 50, right: 50 },
          bufferPages: true,
        });
        const stream = new Writable({
          write(chunk, encoding, callback) {
            chunks.push(chunk);
            callback();
          }
        });
        doc.pipe(stream);
        stream.on('finish', () => resolve(Buffer.concat(chunks)));

        const summary = run.summary || {};
        const results = run.results || [];
        const modNames = {
          accessibility: 'Aksesibilitas', login: 'Login', navigation: 'Navigasi',
          security: 'Keamanan', performance: 'Performa', responsive: 'Responsif',
          form_validation: 'Validasi Form', menu_traversal: 'Menu Traversal',
          api_response: 'API Response', cookie_session: 'Cookie & Session', content_seo: 'Content & SEO',
          dashboard: 'Dashboard', crud: 'CRUD', payment: 'Payment', camera: 'Camera',
          multi_role: 'Multi-Role', file_upload: 'File Upload', email_notif: 'Email & Notif', booking: 'Booking',
        };

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colX = doc.page.margins.left;
        const pageH = doc.page.height;
        const brandColor = '#2563eb';
        const brandDark = '#1e40af';
        const brandLight = '#60a5fa';
        const passColor = '#0d9488';
        const failColor = '#e11d48';
        const warnColor = '#f59e0b';
        const darkText = '#1e293b';
        const mutedText = '#64748b';
        const lightBg = '#eff6ff';
        const borderColor = '#e2e8f0';
        let y;

        // ===== Helper functions =====
        const drawSectionTitle = (title, color = brandColor) => {
          if (doc.y > pageH - 100) doc.addPage();
          doc.fontSize(13).fillColor(color).font('Helvetica-Bold').text(title, colX, doc.y, { underline: false });
          doc.moveTo(colX, doc.y + 4).lineTo(colX + pageWidth, doc.y + 4).strokeColor(color).lineWidth(2).stroke();
          doc.moveDown(1);
        };

        const drawInfoRow = (label, value) => {
          doc.fontSize(9).fillColor(mutedText).font('Helvetica').text(label, colX, doc.y);
          doc.fillColor(darkText).font('Helvetica-Bold').text(value, colX + 130, doc.y - 12, { width: pageWidth - 130 });
          doc.moveDown(0.6);
        };

        const checkPageBreak = (needed = 60) => {
          if (doc.y > pageH - needed - 60) {
            doc.addPage();
            return true;
          }
          return false;
        };

        // ===== COVER PAGE =====
        // Top gradient bar
        doc.rect(0, 0, doc.page.width, 8).fill(brandColor);
        doc.rect(0, 8, doc.page.width, 4).fill(brandLight);

        // Logo area
        doc.roundedRect(colX, 50, 48, 48, 10).fill(brandColor);
        doc.fontSize(22).fillColor('#ffffff').font('Helvetica-Bold').text('S', colX + 16, 62);

        // Title
        doc.fontSize(26).fillColor(brandDark).font('Helvetica-Bold').text('SkyourTest', colX + 60, 52);
        doc.fontSize(10).fillColor(mutedText).font('Helvetica').text('QC Automation Testing Platform', colX + 60, 78);

        // Report title
        doc.moveDown(3);
        doc.fontSize(20).fillColor(darkText).font('Helvetica-Bold').text('Laporan Hasil Pengujian', colX, doc.y);
        doc.moveDown(0.3);
        doc.fontSize(11).fillColor(mutedText).font('Helvetica').text('Dokumen ini berisi hasil lengkap pengujian kualitas yang dilakukan secara otomatis.', colX, doc.y, { width: pageWidth });
        doc.moveDown(2);

        // Horizontal divider
        doc.moveTo(colX, doc.y).lineTo(colX + pageWidth, doc.y).strokeColor(borderColor).lineWidth(1).stroke();
        doc.moveDown(1);

        // ===== INFO TABLE =====
        drawSectionTitle('Informasi Pengujian');
        drawInfoRow('URL Target', run.url || '-');
        drawInfoRow('Browser Engine', 'Chromium');
        const modeNames = { login_dashboard: 'Login ke Dashboard', direct_dashboard: 'Langsung Dashboard', login_only: 'Halaman Login Saja', dashboard_with_login: 'Dashboard + Menu Login' };
        drawInfoRow('Mode Pengujian', modeNames[run.testMode] || 'Login ke Dashboard');
        drawInfoRow('Tanggal Eksekusi', new Date(run.startTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
        if (run.endTime) {
          drawInfoRow('Tanggal Selesai', new Date(run.endTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
          const duration = (new Date(run.endTime) - new Date(run.startTime)) / 1000;
          drawInfoRow('Total Durasi', `${duration.toFixed(1)} detik`);
        }
        drawInfoRow('Status', run.status === 'completed' ? 'Selesai' : run.status === 'error' ? 'Error' : 'Berjalan');
        if (run.triggeredBy === 'webhook') {
          drawInfoRow('Triggered By', 'Webhook / CI-CD');
        }
        drawInfoRow('Report Generated', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
        doc.moveDown(1.5);

        // ===== SUMMARY STAT CARDS =====
        drawSectionTitle('Ringkasan Hasil');

        const stats = [
          { label: 'Total Tes', value: String(summary.total || 0), color: brandColor, bgColor: '#dbeafe' },
          { label: 'Lulus', value: String(summary.passed || 0), color: passColor, bgColor: '#ccfbf1' },
          { label: 'Gagal', value: String(summary.failed || 0), color: failColor, bgColor: '#ffe4e6' },
          { label: 'Catatan', value: String(summary.notes || 0), color: warnColor, bgColor: '#fef3c7' },
          { label: 'Pass Rate', value: `${summary.passRate || 0}%`, color: (summary.passRate || 0) >= 90 ? passColor : (summary.passRate || 0) >= 70 ? warnColor : failColor, bgColor: '#f3f4f6' },
        ];

        const cardW = (pageWidth - 40) / 5;
        const cardY = doc.y;
        stats.forEach((stat, i) => {
          const x = colX + i * (cardW + 10);
          // Card background
          doc.roundedRect(x, cardY, cardW, 60, 8).fillAndStroke(stat.bgColor, stat.color);
          // Label
          doc.fillColor(mutedText).fontSize(7).font('Helvetica').text(stat.label, x + 5, cardY + 8, { width: cardW - 10, align: 'center' });
          // Value
          doc.fillColor(stat.color).fontSize(20).font('Helvetica-Bold').text(stat.value, x + 5, cardY + 24, { width: cardW - 10, align: 'center' });
        });
        doc.y = cardY + 80;
        doc.moveDown(1);

        // ===== MODULE BREAKDOWN =====
        if (summary.modules) {
          drawSectionTitle('Hasil Per Modul');

          const modules = Object.entries(summary.modules);
          const modColWidths = [pageWidth * 0.30, pageWidth * 0.12, pageWidth * 0.12, pageWidth * 0.12, pageWidth * 0.14, pageWidth * 0.20];
          const modHeaders = ['Modul', 'Total', 'Lulus', 'Gagal', 'Pass Rate', 'Visual'];

          // Header row
          y = doc.y;
          modHeaders.forEach((h, i) => {
            doc.rect(colX + modColWidths.slice(0, i).reduce((a, b) => a + b, 0), y, modColWidths[i], 22).fill(brandColor);
            doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text(h,
              colX + modColWidths.slice(0, i).reduce((a, b) => a + b, 0) + 4, y + 7,
              { width: modColWidths[i] - 8, align: i === 0 ? 'left' : 'center' });
          });
          doc.y = y + 22;

          // Data rows
          modules.forEach(([mod, data], idx) => {
            checkPageBreak(30);
            y = doc.y;
            const rate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : '0';
            const rateNum = parseFloat(rate);
            const rateColor = rateNum >= 80 ? passColor : rateNum >= 50 ? warnColor : failColor;
            const bg = idx % 2 === 0 ? lightBg : '#ffffff';
            const xOffsets = modColWidths.reduce((acc, w, i) => { acc.push(i === 0 ? colX : acc[i - 1] + modColWidths[i - 1]); return acc; }, []);

            doc.rect(colX, y, pageWidth, 24).fill(bg);
            const values = [modNames[mod] || mod, String(data.total), String(data.passed), String(data.failed), `${rate}%`];
            values.forEach((v, i) => {
              doc.fillColor(i === 4 ? rateColor : darkText).fontSize(8).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').text(v, xOffsets[i] + 4, y + 8, { width: modColWidths[i] - 8, align: i === 0 ? 'left' : 'center' });
            });

            // Visual bar
            const barX = xOffsets[5] + 4;
            const barW = modColWidths[5] - 8;
            const barY = y + 9;
            doc.roundedRect(barX, barY, barW, 6, 3).fill('#e2e8f0');
            if (rateNum > 0) {
              doc.roundedRect(barX, barY, barW * (rateNum / 100), 6, 3).fill(rateColor);
            }

            doc.y = y + 24;
          });

          // Total row
          checkPageBreak(30);
          y = doc.y;
          modColWidths.forEach((w, i) => {
            doc.rect(i === 0 ? colX : colX + modColWidths.slice(0, i).reduce((a, b) => a + b, 0), y, w, 24).fill(brandDark);
          });
          const totalValues = ['TOTAL', String(summary.total), String(summary.passed), String(summary.failed), `${summary.passRate}%`];
          totalValues.forEach((v, i) => {
            doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text(v,
              colX + modColWidths.slice(0, i).reduce((a, b) => a + b, 0) + 4, y + 8,
              { width: modColWidths[i] - 8, align: i === 0 ? 'left' : 'center' });
          });
          doc.y = y + 24;
          doc.moveDown(1.5);
        }

        // ===== FAILED TESTS DETAIL =====
        const failedTests = results.filter(r => r.status === 'failed');
        if (failedTests.length > 0) {
          checkPageBreak(100);
          drawSectionTitle(`Detail Tes Gagal (${failedTests.length})`, failColor);

          failedTests.forEach((r, i) => {
            checkPageBreak(80);

            // Test header bar
            y = doc.y;
            doc.roundedRect(colX, y, pageWidth, 20, 5).fill('#ffe4e6');
            doc.fillColor(failColor).fontSize(9).font('Helvetica-Bold').text(`${i + 1}. [${r.testId}] ${r.title}`, colX + 8, y + 6, { width: pageWidth - 16 });
            doc.y = y + 24;

            // Details
            doc.fontSize(8).fillColor(mutedText).font('Helvetica-Bold').text('Modul:', colX + 8, doc.y);
            doc.fillColor(darkText).font('Helvetica').text(modNames[r.module] || r.module, colX + 60, doc.y - 10);
            doc.moveDown(0.5);

            if (r.preConditions) {
              doc.fillColor(mutedText).font('Helvetica-Bold').text('Pre-Conditions:', colX + 8, doc.y);
              doc.fillColor(darkText).font('Helvetica').text(r.preConditions, colX + 100, doc.y - 10, { width: pageWidth - 108 });
              doc.moveDown(0.5);
            }

            if (r.expected) {
              doc.fillColor(mutedText).font('Helvetica-Bold').text('Expected:', colX + 8, doc.y);
              doc.fillColor(darkText).font('Helvetica').text(r.expected, colX + 80, doc.y - 10, { width: pageWidth - 88 });
              doc.moveDown(0.5);
            }

            doc.fillColor(mutedText).font('Helvetica-Bold').text('Actual:', colX + 8, doc.y);
            doc.fillColor(failColor).font('Helvetica').text(r.actual || '-', colX + 70, doc.y - 10, { width: pageWidth - 78 });
            doc.moveDown(0.5);

            if (r.error) {
              doc.fillColor(mutedText).font('Helvetica-Bold').text('Error:', colX + 8, doc.y);
              doc.moveDown(0.3);
              doc.roundedRect(colX + 8, doc.y, pageWidth - 16, 16, 4).fill('#fef2f2');
              doc.fillColor(failColor).fontSize(7).font('Courier').text(r.error, colX + 12, doc.y + 4, { width: pageWidth - 24 });
              doc.y += 20;
            }

            doc.moveDown(1);
          });
          doc.moveDown(1);
        }

        // ===== ALL RESULTS TABLE =====
        checkPageBreak(80);
        drawSectionTitle('Detail Semua Tes');

        const resColWidths = [pageWidth * 0.05, pageWidth * 0.12, pageWidth * 0.34, pageWidth * 0.09, pageWidth * 0.08, pageWidth * 0.08, pageWidth * 0.24];
        const resHeaders = ['#', 'Test ID', 'Judul', 'Status', 'Durasi', 'Cat', 'Modul'];

        const drawResultsHeader = () => {
          const hy = doc.y;
          resHeaders.forEach((h, i) => {
            const hx = colX + resColWidths.slice(0, i).reduce((a, b) => a + b, 0);
            doc.rect(hx, hy, resColWidths[i], 20).fill(brandColor);
            doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold').text(h, hx + 2, hy + 6, { width: resColWidths[i] - 4, align: 'center' });
          });
          doc.y = hy + 20;
        };

        drawResultsHeader();

        results.forEach((r, i) => {
          if (checkPageBreak(24)) drawResultsHeader();

          y = doc.y;
          const bg = i % 2 === 0 ? lightBg : '#ffffff';
          const statusColor = r.status === 'passed' ? passColor : r.status === 'note' ? warnColor : failColor;
          const statusText = r.status === 'passed' ? 'LULUS' : r.status === 'note' ? 'CATATAN' : 'GAGAL';

          doc.rect(colX, y, pageWidth, 18).fill(bg);
          const vals = [String(i + 1), r.testId, r.title, statusText, `${r.duration}ms`, r.category === 'optional' ? 'Opt' : '', modNames[r.module] || r.module];
          vals.forEach((v, j) => {
            const vx = colX + resColWidths.slice(0, j).reduce((a, b) => a + b, 0);
            doc.fillColor(j === 3 ? statusColor : j === 5 ? mutedText : darkText).fontSize(7).font(j === 3 ? 'Helvetica-Bold' : 'Helvetica').text(v, vx + 2, y + 5, { width: resColWidths[j] - 4, align: j === 2 ? 'left' : 'center' });
          });
          doc.y = y + 18;
        });

        // ===== FOOTER on all pages =====
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          const footerY = pageH - 40;
          doc.moveTo(colX, footerY).lineTo(colX + pageWidth, footerY).strokeColor(borderColor).lineWidth(1).stroke();
          doc.fontSize(7).fillColor(mutedText).font('Helvetica').text('SkyourTest - Platform QC Automation Testing | Dilaporkan secara otomatis', colX, footerY + 6, { width: pageWidth, align: 'center' });
          doc.fillColor(brandLight).font('Helvetica-Bold').text(`Halaman ${i + 1} dari ${pages.start + pages.count}`, colX + pageWidth - 80, footerY + 6, { width: 80, align: 'right' });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = PdfGenerator;
