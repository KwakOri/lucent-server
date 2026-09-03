import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as PDFDocument from 'pdfkit';

export type SalesStatsPdfPaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface SalesStatsPdfPaymentMix {
  cash: number;
  card: number;
  transfer: number;
  other: number;
}

export interface SalesStatsPdfDailyRow {
  date: string;
  orders_count: number;
  units_sold: number;
  item_gross_amount: number;
  captured_amount: number;
  refund_amount: number;
  net_settlement_amount: number;
}

export interface SalesStatsPdfSaleRecord {
  soldAt: string | null;
  orderNo: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  amount: number;
}

export interface SalesStatsPdfInput {
  campaignName: string;
  campaignCode: string;
  campaignType: string | null;
  projectName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  generatedAt: Date;
  currencyCode: string;
  summary: {
    ordersCount: number;
    saleLineCount: number;
    unitsSold: number;
    itemGrossAmount: number;
    capturedAmount: number;
    refundAmount: number;
    netSettlementAmount: number;
    paymentMix: SalesStatsPdfPaymentMix;
  };
  daily: SalesStatsPdfDailyRow[];
  sales: SalesStatsPdfSaleRecord[];
}

type TextAlign = 'left' | 'right' | 'center';
type PdfFontWeight =
  | 'regular'
  | 'medium'
  | 'semiBold'
  | 'bold'
  | 'extraBold'
  | 'black';
type PdfMonoFontWeight = 'regular' | 'bold';
type PdfFontCandidate = { path: string; family?: string };
type SalesRecordColumn = {
  label: string;
  width: number;
  align?: TextAlign;
  render: (row: SalesStatsPdfSaleRecord) => string;
};
type SalesRecordGroup = {
  key: string;
  label: string;
  rows: SalesStatsPdfSaleRecord[];
  totalAmount: number;
};
type DailyChartStat = {
  label: string;
  amount: number;
  count: number;
};

const PDF_MARGIN = 36;
const PAGE_BOTTOM_GAP = 28;
const PDF_COLORS = {
  page: '#e9e8e2',
  surface: '#fffdf7',
  surfaceSoft: '#f7f6ef',
  ink: '#17180f',
  inkMuted: '#5f6158',
  muted: '#8e8d82',
  faint: '#dcd9cc',
  line: '#e7e1d3',
  dark: '#17180f',
  darkPanel: '#211f17',
  darkLine: '#302f27',
  accent: '#c6f042',
  green: '#15975b',
  blue: '#3478f6',
  gold: '#a97917',
  white: '#ffffff',
} as const;

const PAPERLOGY_FONT_FILES: Record<PdfFontWeight, string> = {
  regular: 'Paperlogy-4Regular.ttf',
  medium: 'Paperlogy-5Medium.ttf',
  semiBold: 'Paperlogy-6SemiBold.ttf',
  bold: 'Paperlogy-7Bold.ttf',
  extraBold: 'Paperlogy-8ExtraBold.ttf',
  black: 'Paperlogy-9Black.ttf',
};
const PAPERLOGY_FONT_NAMES: Record<PdfFontWeight, string> = {
  regular: 'Paperlogy-Regular',
  medium: 'Paperlogy-Medium',
  semiBold: 'Paperlogy-SemiBold',
  bold: 'Paperlogy-Bold',
  extraBold: 'Paperlogy-ExtraBold',
  black: 'Paperlogy-Black',
};
const SPACE_MONO_FONT_FILES: Record<PdfMonoFontWeight, string> = {
  regular: 'SpaceMono-Regular.ttf',
  bold: 'SpaceMono-Bold.ttf',
};
const SPACE_MONO_FONT_NAMES: Record<PdfMonoFontWeight, string> = {
  regular: 'SpaceMono-Regular',
  bold: 'SpaceMono-Bold',
};

const weekdayFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  weekday: 'short',
});

/**
 * Render one campaign's settlement statement using the flea_market report
 * visual language. The input already contains campaign-filtered facts, so a
 * mixed-campaign order never contributes its unrelated line amount.
 */
export function renderSalesStatsPdf(
  input: SalesStatsPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PDF_MARGIN,
      bufferPages: false,
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('error', (error) => reject(error));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    applyPdfFont(doc);
    renderPageBackground(doc);
    renderHero(doc, input);

    ensurePageSpace(doc, 300);
    renderSectionTitle(doc, '01', '정산 요약', 'SUMMARY');
    renderSummarySection(doc, input);

    ensurePageSpace(doc, 250);
    renderSectionTitle(doc, '02', '날짜별 통계', 'DAILY');
    renderDailyStatsGraph(doc, input.daily, input.currencyCode);
    renderSalesRecordsSection(doc, input);

    doc.end();
  });
}

function renderHero(doc: PDFKit.PDFDocument, input: SalesStatsPdfInput) {
  const x = getContentX(doc);
  const y = doc.y;
  const width = getContentWidth(doc);
  const height = 288;
  const innerX = x + 26;
  const innerWidth = width - 52;
  const projectLabel = input.projectName || 'LUCENT';

  drawRoundedRect(doc, x, y, width, height, 24, PDF_COLORS.dark);

  doc.circle(innerX + 5, y + 27, 4).fill(PDF_COLORS.accent);
  setPdfFont(doc, 'medium');
  doc
    .fontSize(8)
    .fillColor('#c9cabd')
    .text(projectLabel, innerX + 16, y + 22, {
      width: innerWidth - 210,
      characterSpacing: 0.4,
      ellipsis: true,
      lineBreak: false,
    });
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text(
      `생성 ${formatDateTime(input.generatedAt.toISOString())}`,
      x,
      y + 22,
      {
        width: width - 26,
        align: 'right',
        lineBreak: false,
      },
    );

  setPdfMonoFont(doc);
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.accent)
    .text('Campaign Settlement', innerX, y + 64, {
      width: innerWidth,
      characterSpacing: 0.5,
      lineBreak: false,
    });
  setPdfFont(doc, 'extraBold');
  doc
    .fontSize(31)
    .fillColor(PDF_COLORS.white)
    .text(input.campaignName || '이름 없는 캠페인', innerX, y + 87, {
      width: innerWidth,
      height: 40,
      ellipsis: true,
      lineBreak: false,
    });
  setPdfFont(doc, 'medium');
  doc
    .fontSize(11)
    .fillColor('#dadbd1')
    .text('캠페인 정산 내역서', innerX + 1, y + 132, {
      width: innerWidth,
      lineBreak: false,
    });

  const pillY = y + 158;
  const pillGap = 8;
  const pillWidth = (innerWidth - pillGap * 2) / 3;
  drawHeroMetaPill(
    doc,
    '기간',
    formatCampaignPeriod(input.startsAt, input.endsAt),
    innerX,
    pillY,
    pillWidth,
  );
  drawHeroMetaPill(
    doc,
    '캠페인 유형',
    input.campaignType || '-',
    innerX + pillWidth + pillGap,
    pillY,
    pillWidth,
  );
  drawHeroMetaPill(
    doc,
    '판매',
    `${formatNumber(input.summary.saleLineCount)}건`,
    innerX + (pillWidth + pillGap) * 2,
    pillY,
    pillWidth,
  );

  const payoutY = y + 204;
  const payoutHeight = 64;
  drawRoundedRect(
    doc,
    innerX,
    payoutY,
    innerWidth,
    payoutHeight,
    16,
    PDF_COLORS.darkPanel,
    PDF_COLORS.darkLine,
  );
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text('정산 기준 순매출 / Net', innerX + 18, payoutY + 14, {
      width: 180,
      lineBreak: false,
    });
  setPdfFont(doc, 'black');
  doc
    .fontSize(25)
    .fillColor(PDF_COLORS.accent)
    .text(
      formatCurrency(input.summary.netSettlementAmount, input.currencyCode),
      innerX + 18,
      payoutY + 26,
      {
        width: 250,
        height: 32,
        ellipsis: true,
        lineBreak: false,
      },
    );
  setPdfFont(doc, 'medium');
  doc
    .fontSize(8)
    .fillColor('#c8c9c0')
    .text(
      `상품매출 ${formatCurrency(input.summary.itemGrossAmount, input.currencyCode)}`,
      innerX + innerWidth - 194,
      payoutY + 17,
      {
        width: 176,
        align: 'right',
        lineBreak: false,
      },
    );
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text(
      `- 환불 ${formatCurrency(input.summary.refundAmount, input.currencyCode)}`,
      innerX + innerWidth - 194,
      payoutY + 36,
      {
        width: 176,
        align: 'right',
        lineBreak: false,
      },
    );

  doc.y = y + height + 42;
}

function renderSummarySection(
  doc: PDFKit.PDFDocument,
  input: SalesStatsPdfInput,
) {
  ensurePageSpace(doc, 280);

  const x = getContentX(doc);
  const y = doc.y;
  const width = getContentWidth(doc);
  const gap = 12;
  const topHeight = 126;
  const settlementHeight = 132;
  const grossWidth = 208;

  renderGrossSummaryCard(doc, input, x, y, grossWidth, topHeight);
  renderPaymentMixCard(
    doc,
    input.summary.paymentMix,
    input.summary.capturedAmount,
    x + grossWidth + gap,
    y,
    width - grossWidth - gap,
    topHeight,
    input.currencyCode,
  );
  renderSettlementCard(
    doc,
    input,
    x,
    y + topHeight + gap,
    width,
    settlementHeight,
  );

  doc.y = y + topHeight + gap + settlementHeight + 26;
}

function renderGrossSummaryCard(
  doc: PDFKit.PDFDocument,
  input: SalesStatsPdfInput,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  drawRoundedRect(
    doc,
    x,
    y,
    width,
    height,
    18,
    PDF_COLORS.white,
    PDF_COLORS.line,
  );
  setPdfFont(doc, 'medium');
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text('상품매출 / Gross', x + 18, y + 20, {
      width: width - 36,
      lineBreak: false,
    });
  setPdfFont(doc, 'extraBold');
  doc
    .fontSize(24)
    .fillColor(PDF_COLORS.ink)
    .text(
      formatCurrency(input.summary.itemGrossAmount, input.currencyCode),
      x + 18,
      y + 42,
      {
        width: width - 36,
        height: 30,
        ellipsis: true,
        lineBreak: false,
      },
    );
  drawTinyMetric(
    doc,
    '판매 건수',
    `${formatNumber(input.summary.saleLineCount)}건`,
    x + 18,
    y + 88,
    78,
  );
  drawTinyMetric(
    doc,
    '주문 건수',
    `${formatNumber(input.summary.ordersCount)}건`,
    x + 106,
    y + 88,
    78,
  );
}

function renderPaymentMixCard(
  doc: PDFKit.PDFDocument,
  mix: SalesStatsPdfPaymentMix,
  total: number,
  x: number,
  y: number,
  width: number,
  height: number,
  currencyCode: string,
) {
  const items = [
    { label: '현금', amount: Number(mix.cash || 0), color: PDF_COLORS.green },
    { label: '카드', amount: Number(mix.card || 0), color: PDF_COLORS.blue },
    {
      label: '계좌',
      amount: Number(mix.transfer || 0),
      color: PDF_COLORS.gold,
    },
    { label: '기타', amount: Number(mix.other || 0), color: PDF_COLORS.faint },
  ];
  const positiveTotal = Math.max(0, Number(total || 0));

  drawRoundedRect(
    doc,
    x,
    y,
    width,
    height,
    18,
    PDF_COLORS.white,
    PDF_COLORS.line,
  );
  setPdfFont(doc, 'medium');
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text('결제 구성 / Payment mix', x + 18, y + 18, {
      width: width - 36,
      lineBreak: false,
    });

  const barX = x + 18;
  const barY = y + 42;
  const barWidth = width - 36;
  const barHeight = 14;
  drawRoundedRect(
    doc,
    barX,
    barY,
    barWidth,
    barHeight,
    7,
    PDF_COLORS.surfaceSoft,
  );
  let currentX = barX;
  items.forEach((item, index) => {
    if (positiveTotal <= 0 || item.amount <= 0) {
      return;
    }
    const isLast = index === items.length - 1;
    const segmentWidth = isLast
      ? barX + barWidth - currentX
      : Math.max((item.amount / positiveTotal) * barWidth, 1);
    doc.rect(currentX, barY, segmentWidth, barHeight).fill(item.color);
    currentX += segmentWidth;
  });

  const legendColumnWidth = (width - 36) / 2;
  items.forEach((item, index) => {
    const rowX = x + 18 + (index % 2) * legendColumnWidth;
    const rowY = y + 72 + Math.floor(index / 2) * 22;
    const percentage =
      positiveTotal > 0
        ? `${Math.round((item.amount / positiveTotal) * 100)}%`
        : '0%';
    doc.circle(rowX + 4, rowY + 6, 3).fill(item.color);
    setPdfFont(doc, 'medium');
    doc
      .fontSize(8)
      .fillColor(PDF_COLORS.inkMuted)
      .text(item.label, rowX + 12, rowY, {
        width: 34,
        lineBreak: false,
      });
    setPdfFont(doc, 'medium');
    doc
      .fontSize(7)
      .fillColor(PDF_COLORS.ink)
      .text(formatCurrency(item.amount, currencyCode), rowX + 43, rowY + 1, {
        width: legendColumnWidth - 73,
        height: 10,
        ellipsis: true,
        lineBreak: false,
      });
    setPdfFont(doc, 'regular');
    doc
      .fontSize(7)
      .fillColor(PDF_COLORS.muted)
      .text(percentage, rowX + legendColumnWidth - 25, rowY + 1, {
        width: 23,
        align: 'right',
        lineBreak: false,
      });
  });
}

function renderSettlementCard(
  doc: PDFKit.PDFDocument,
  input: SalesStatsPdfInput,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  drawRoundedRect(doc, x, y, width, height, 18, PDF_COLORS.dark);
  setPdfFont(doc, 'medium');
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text('정산 내역 / Settlement', x + 18, y + 17, {
      width: width - 36,
      lineBreak: false,
    });

  const items = [
    {
      label: '결제 매출',
      value: input.summary.capturedAmount,
      meta: 'CAPTURE',
    },
    { label: '환불 차감', value: input.summary.refundAmount, meta: 'REFUND' },
    {
      label: '정산 기준 순매출',
      value: input.summary.netSettlementAmount,
      meta: 'NET',
    },
  ];
  const innerX = x + 18;
  const itemGap = 10;
  const itemWidth = (width - 36 - itemGap * 2) / 3;
  items.forEach((item, index) => {
    const itemX = innerX + index * (itemWidth + itemGap);
    drawRoundedRect(
      doc,
      itemX,
      y + 42,
      itemWidth,
      42,
      12,
      PDF_COLORS.darkPanel,
      PDF_COLORS.darkLine,
    );
    setPdfFont(doc, 'medium');
    doc
      .fontSize(8)
      .fillColor(PDF_COLORS.muted)
      .text(item.label, itemX + 12, y + 51, {
        width: itemWidth - 24,
        lineBreak: false,
      });
    setPdfFont(doc, 'bold');
    doc
      .fontSize(12)
      .fillColor(index === 2 ? PDF_COLORS.accent : PDF_COLORS.white)
      .text(
        formatCurrency(item.value, input.currencyCode),
        itemX + 12,
        y + 66,
        {
          width: itemWidth - 58,
          height: 14,
          ellipsis: true,
          lineBreak: false,
        },
      );
    setPdfFont(doc, 'regular');
    doc
      .fontSize(7)
      .fillColor(PDF_COLORS.muted)
      .text(item.meta, itemX + itemWidth - 48, y + 68, {
        width: 36,
        align: 'right',
        lineBreak: false,
      });
  });

  setPdfFont(doc, 'semiBold');
  doc
    .fontSize(9)
    .fillColor('#d7d8cf')
    .text(
      `결제 매출 ${formatCurrency(input.summary.capturedAmount, input.currencyCode)} - 환불 차감 ${formatCurrency(input.summary.refundAmount, input.currencyCode)} = 순매출 ${formatCurrency(input.summary.netSettlementAmount, input.currencyCode)}`,
      innerX,
      y + 100,
      {
        width: width - 36,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      },
    );
}

function renderDailyStatsGraph(
  doc: PDFKit.PDFDocument,
  dailyRows: SalesStatsPdfDailyRow[],
  currencyCode: string,
) {
  ensurePageSpace(doc, 234);

  const stats = buildDailyChartStats(dailyRows);
  const chartX = getContentX(doc);
  const chartY = doc.y;
  const chartWidth = getContentWidth(doc);
  const chartHeight = 206;
  const plotX = chartX + 34;
  const plotY = chartY + 42;
  const plotWidth = chartWidth - 68;
  const plotHeight = 112;
  const baselineY = plotY + plotHeight;
  const maxAmount = Math.max(...stats.map((stat) => stat.amount), 0);
  const totalAmount = stats.reduce((sum, stat) => sum + stat.amount, 0);
  const totalCount = stats.reduce((sum, stat) => sum + stat.count, 0);

  drawRoundedRect(
    doc,
    chartX,
    chartY,
    chartWidth,
    chartHeight,
    18,
    PDF_COLORS.white,
    PDF_COLORS.line,
  );
  setPdfFont(doc, 'medium');
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.muted)
    .text(
      `날짜별 정산 기준 순매출 · 합계 ${formatCurrency(totalAmount, currencyCode)} / ${formatNumber(totalCount)}건`,
      chartX + 22,
      chartY + 20,
      {
        width: chartWidth - 44,
        ellipsis: true,
        lineBreak: false,
      },
    );

  if (stats.length === 0) {
    doc
      .fontSize(13)
      .fillColor(PDF_COLORS.muted)
      .text('판매 통계가 없습니다.', chartX + 22, chartY + 102, {
        width: chartWidth - 44,
        align: 'center',
        lineBreak: false,
      });
    doc.y = chartY + chartHeight + 28;
    return;
  }

  [0, 0.5, 1].forEach((ratio) => {
    const gridY = baselineY - plotHeight * ratio;
    doc
      .lineWidth(0.4)
      .strokeColor(PDF_COLORS.line)
      .moveTo(plotX, gridY)
      .lineTo(plotX + plotWidth, gridY)
      .stroke();
  });

  const barSlotWidth = plotWidth / stats.length;
  const barWidth = Math.min(34, barSlotWidth * 0.42);
  stats.forEach((stat, index) => {
    const slotX = plotX + index * barSlotWidth;
    const barX = slotX + (barSlotWidth - barWidth) / 2;
    const barHeight =
      maxAmount > 0
        ? Math.max((stat.amount / maxAmount) * (plotHeight - 12), 4)
        : 4;
    const barY = baselineY - barHeight;
    const barColor =
      stat.amount === maxAmount ? PDF_COLORS.accent : PDF_COLORS.dark;
    drawRoundedRect(doc, barX, barY, barWidth, barHeight, 4, barColor);
    setPdfFont(doc, 'semiBold');
    doc
      .fontSize(8)
      .fillColor(PDF_COLORS.ink)
      .text(`${formatNumber(stat.count)}건`, slotX, barY - 13, {
        width: barSlotWidth,
        align: 'center',
        lineBreak: false,
      });
    setPdfFont(doc, 'semiBold');
    doc
      .fontSize(8)
      .fillColor(PDF_COLORS.inkMuted)
      .text(stat.label, slotX, baselineY + 10, {
        width: barSlotWidth,
        align: 'center',
        lineBreak: false,
      });
    setPdfFont(doc, 'regular');
    doc
      .fontSize(8)
      .fillColor(PDF_COLORS.muted)
      .text(
        formatCompactCurrency(stat.amount, currencyCode),
        slotX,
        baselineY + 25,
        {
          width: barSlotWidth,
          align: 'center',
          lineBreak: false,
        },
      );
  });

  doc.y = chartY + chartHeight + 28;
}

function renderSalesRecordsSection(
  doc: PDFKit.PDFDocument,
  input: SalesStatsPdfInput,
) {
  ensurePageSpace(doc, 126);
  renderSectionTitle(
    doc,
    '03',
    '판매 기록',
    `${formatNumber(input.sales.length)}건`,
  );

  if (input.sales.length === 0) {
    renderEmptyCard(doc, '판매 기록이 없습니다.');
    renderReportFooter(doc, input);
    return;
  }

  const columns = createSalesRecordColumns(input.currencyCode);
  const groups = buildSalesRecordGroups(input.sales);
  let pageNeedsContinuationTitle = false;

  for (const group of groups) {
    let cursor = 0;
    while (cursor < group.rows.length) {
      if (pageNeedsContinuationTitle) {
        renderSectionTitle(doc, '03', '판매 기록', '계속');
        pageNeedsContinuationTitle = false;
      }

      const includeGroupHeader = cursor === 0;
      const firstRowHeight = calculateSalesRecordRowHeight(
        doc,
        group.rows[cursor],
        columns,
      );
      const requiredHeight =
        56 + firstRowHeight + (includeGroupHeader ? 30 : 0) + 16;
      ensurePageSpace(doc, requiredHeight);

      const maxY = doc.page.height - doc.page.margins.bottom - PAGE_BOTTOM_GAP;
      const available = maxY - doc.y;
      const headerHeight = 56 + (includeGroupHeader ? 30 : 0) + 16;
      const segmentRows: SalesStatsPdfSaleRecord[] = [];
      let segmentHeight = headerHeight;
      while (cursor + segmentRows.length < group.rows.length) {
        const row = group.rows[cursor + segmentRows.length];
        const rowHeight = calculateSalesRecordRowHeight(doc, row, columns);
        if (segmentRows.length > 0 && segmentHeight + rowHeight > available) {
          break;
        }
        segmentRows.push(row);
        segmentHeight += rowHeight;
        if (segmentHeight > available) {
          break;
        }
      }

      renderSalesRecordSegment(doc, columns, {
        group,
        includeGroupHeader,
        rows: segmentRows,
        rowOffset: cursor,
        currencyCode: input.currencyCode,
      });
      cursor += segmentRows.length;

      if (cursor < group.rows.length) {
        addReportPage(doc);
        pageNeedsContinuationTitle = true;
      }
    }
  }

  renderReportFooter(doc, input);
}

function renderSalesRecordSegment(
  doc: PDFKit.PDFDocument,
  columns: SalesRecordColumn[],
  input: {
    group: SalesRecordGroup;
    includeGroupHeader: boolean;
    rows: SalesStatsPdfSaleRecord[];
    rowOffset: number;
    currencyCode: string;
  },
) {
  const x = getContentX(doc);
  const y = doc.y;
  const width = getContentWidth(doc);
  const topPadding = 8;
  const columnHeaderHeight = 32;
  const groupHeaderHeight = input.includeGroupHeader ? 30 : 0;
  const bottomPadding = 16;
  const rowHeight = input.rows.reduce(
    (sum, row) => sum + calculateSalesRecordRowHeight(doc, row, columns),
    0,
  );
  const height =
    topPadding +
    columnHeaderHeight +
    groupHeaderHeight +
    rowHeight +
    bottomPadding;
  const innerX = x + 18;
  const gap = 8;
  const columnsWidth =
    columns.reduce((sum, column) => sum + column.width, 0) +
    gap * (columns.length - 1);

  drawRoundedRect(
    doc,
    x,
    y,
    width,
    height,
    18,
    PDF_COLORS.white,
    PDF_COLORS.line,
  );
  drawSalesRecordColumnHeader(doc, columns, innerX, y + topPadding + 12, gap);
  doc
    .moveTo(x, y + topPadding + columnHeaderHeight)
    .lineTo(x + width, y + topPadding + columnHeaderHeight)
    .lineWidth(0.4)
    .strokeColor(PDF_COLORS.line)
    .stroke();

  let currentY = y + topPadding + columnHeaderHeight;
  if (input.includeGroupHeader) {
    renderSalesRecordGroupRow(
      doc,
      input.group,
      innerX,
      currentY,
      columnsWidth,
      input.currencyCode,
    );
    currentY += groupHeaderHeight;
  }
  input.rows.forEach((row, index) => {
    renderSalesRecordRow(
      doc,
      row,
      columns,
      innerX,
      currentY,
      gap,
      input.rowOffset + index,
    );
    currentY += calculateSalesRecordRowHeight(doc, row, columns);
  });
  doc.y = y + height + 16;
}

function createSalesRecordColumns(currencyCode: string): SalesRecordColumn[] {
  return [
    { label: '시각', width: 44, render: (row) => formatTime(row.soldAt) },
    { label: '주문번호', width: 88, render: (row) => row.orderNo || '-' },
    {
      label: '상품',
      width: 180,
      render: (row) =>
        row.variantName
          ? `${row.productName} · ${row.variantName}`
          : row.productName,
    },
    {
      label: '수량',
      width: 42,
      align: 'right',
      render: (row) => formatNumber(row.quantity),
    },
    {
      label: '캠페인 매출',
      width: 102,
      align: 'right',
      render: (row) => formatCurrency(row.amount, currencyCode),
    },
  ];
}

function drawSalesRecordColumnHeader(
  doc: PDFKit.PDFDocument,
  columns: SalesRecordColumn[],
  x: number,
  y: number,
  gap: number,
) {
  let currentX = x;
  columns.forEach((column) => {
    setPdfFont(doc, 'medium');
    doc
      .fontSize(7)
      .fillColor(PDF_COLORS.muted)
      .text(column.label, currentX, y, {
        width: column.width,
        align: column.align || 'left',
        lineBreak: false,
      });
    currentX += column.width + gap;
  });
}

function renderSalesRecordGroupRow(
  doc: PDFKit.PDFDocument,
  group: SalesRecordGroup,
  x: number,
  y: number,
  width: number,
  currencyCode: string,
) {
  drawRoundedRect(doc, x, y + 4, width, 22, 11, PDF_COLORS.surfaceSoft);
  setPdfFont(doc, 'bold');
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.ink)
    .text(group.label, x + 12, y + 10, {
      width: 150,
      lineBreak: false,
    });
  setPdfFont(doc, 'regular');
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text(`${formatNumber(group.rows.length)}건`, x + 165, y + 10, {
      width: 52,
      lineBreak: false,
    });
  setPdfFont(doc, 'bold');
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.ink)
    .text(
      formatCurrency(group.totalAmount, currencyCode),
      x + width - 130,
      y + 10,
      {
        width: 118,
        align: 'right',
        lineBreak: false,
      },
    );
}

function renderSalesRecordRow(
  doc: PDFKit.PDFDocument,
  row: SalesStatsPdfSaleRecord,
  columns: SalesRecordColumn[],
  x: number,
  y: number,
  gap: number,
  rowIndex: number,
) {
  const rowHeight = calculateSalesRecordRowHeight(doc, row, columns);
  const rowWidth =
    columns.reduce((sum, column) => sum + column.width, 0) +
    gap * (columns.length - 1);
  doc
    .rect(x, y, rowWidth, rowHeight)
    .fill(rowIndex % 2 === 0 ? PDF_COLORS.white : '#fbfaf5');
  doc
    .moveTo(x, y + rowHeight)
    .lineTo(x + rowWidth, y + rowHeight)
    .lineWidth(0.35)
    .strokeColor(PDF_COLORS.line)
    .stroke();

  let currentX = x;
  columns.forEach((column) => {
    const value = column.render(row);
    const isAmountColumn = column.align === 'right';
    setPdfFont(doc, isAmountColumn ? 'bold' : 'regular');
    doc
      .fontSize(isAmountColumn ? 9 : 8)
      .fillColor(isAmountColumn ? PDF_COLORS.ink : PDF_COLORS.inkMuted)
      .text(value, currentX, y + 11, {
        width: column.width,
        height: rowHeight - 16,
        align: column.align || 'left',
        ellipsis: true,
        lineBreak: false,
      });
    currentX += column.width + gap;
  });
}

function calculateSalesRecordRowHeight(
  doc: PDFKit.PDFDocument,
  row: SalesStatsPdfSaleRecord,
  columns: SalesRecordColumn[],
): number {
  const textHeight = Math.max(
    ...columns.map((column) =>
      doc.heightOfString(column.render(row), {
        width: column.width,
        height: 32,
        ellipsis: true,
      }),
    ),
  );
  return Math.max(42, Math.ceil(textHeight) + 18);
}

function renderSectionTitle(
  doc: PDFKit.PDFDocument,
  index: string,
  title: string,
  meta: string,
) {
  ensurePageSpace(doc, 48);
  const x = getContentX(doc);
  const y = doc.y;
  const width = getContentWidth(doc);
  setPdfMonoFont(doc, 'bold');
  doc
    .fontSize(10)
    .fillColor(PDF_COLORS.muted)
    .text(index, x, y + 12, { width: 24, lineBreak: false });
  setPdfFont(doc, 'extraBold');
  doc
    .fontSize(22)
    .fillColor(PDF_COLORS.ink)
    .text(title, x + 32, y, { width: 260, lineBreak: false });
  setPdfFont(doc, 'medium');
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text(meta, x, y + 10, { width, align: 'right', lineBreak: false });
  doc.y = y + 44;
}

function renderReportFooter(
  doc: PDFKit.PDFDocument,
  input: SalesStatsPdfInput,
) {
  ensurePageSpace(doc, 28);
  const x = getContentX(doc);
  const y = doc.y + 2;
  const width = getContentWidth(doc);
  setPdfFont(doc, 'regular');
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text(`${input.projectName || 'LUCENT'} · ${input.campaignName}`, x, y, {
      width: width / 2,
      ellipsis: true,
      lineBreak: false,
    });
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text(`생성 ${formatDateTime(input.generatedAt.toISOString())}`, x, y, {
      width,
      align: 'right',
      lineBreak: false,
    });
  doc.y = y + 24;
}

function renderEmptyCard(doc: PDFKit.PDFDocument, message: string) {
  const x = getContentX(doc);
  const y = doc.y;
  const width = getContentWidth(doc);
  const height = 96;
  drawRoundedRect(
    doc,
    x,
    y,
    width,
    height,
    18,
    PDF_COLORS.white,
    PDF_COLORS.line,
  );
  setPdfFont(doc, 'medium');
  doc
    .fontSize(12)
    .fillColor(PDF_COLORS.muted)
    .text(message, x + 20, y + 40, {
      width: width - 40,
      align: 'center',
      lineBreak: false,
    });
  doc.y = y + height + 26;
}

function drawHeroMetaPill(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  drawRoundedRect(
    doc,
    x,
    y,
    width,
    32,
    16,
    PDF_COLORS.darkPanel,
    PDF_COLORS.darkLine,
  );
  setPdfFont(doc, 'regular');
  doc
    .fontSize(7)
    .fillColor(PDF_COLORS.muted)
    .text(label, x + 12, y + 7, { width: width - 24, lineBreak: false });
  setPdfFont(doc, 'semiBold');
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.white)
    .text(value, x + 12, y + 18, {
      width: width - 24,
      height: 11,
      ellipsis: true,
      lineBreak: false,
    });
}

function drawTinyMetric(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  drawRoundedRect(doc, x, y, width, 22, 11, PDF_COLORS.surfaceSoft);
  setPdfFont(doc, 'regular');
  doc
    .fontSize(7)
    .fillColor(PDF_COLORS.muted)
    .text(label, x + 8, y + 7, { width: width - 42, lineBreak: false });
  setPdfFont(doc, 'bold');
  doc
    .fontSize(8)
    .fillColor(PDF_COLORS.ink)
    .text(value, x + width - 36, y + 7, {
      width: 28,
      align: 'right',
      lineBreak: false,
    });
}

function ensurePageSpace(doc: PDFKit.PDFDocument, requiredHeight: number) {
  const maxY = doc.page.height - doc.page.margins.bottom - PAGE_BOTTOM_GAP;
  if (doc.y + requiredHeight <= maxY) {
    return;
  }
  addReportPage(doc);
}

function addReportPage(doc: PDFKit.PDFDocument) {
  doc.addPage();
  applyPdfFont(doc);
  renderPageBackground(doc);
  doc.y = doc.page.margins.top;
}

function renderPageBackground(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_COLORS.page);
  doc.restore();
}

function drawRoundedRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillColor: string,
  strokeColor?: string,
) {
  if (strokeColor) {
    doc
      .roundedRect(x, y, width, height, radius)
      .fillAndStroke(fillColor, strokeColor);
    return;
  }
  doc.roundedRect(x, y, width, height, radius).fill(fillColor);
}

function buildSalesRecordGroups(
  sales: SalesStatsPdfSaleRecord[],
): SalesRecordGroup[] {
  const groups = new Map<string, SalesRecordGroup>();
  for (const sale of sales) {
    const key = getKoreanDateKey(sale.soldAt) || 'unknown';
    const group = groups.get(key) || {
      key,
      label: key === 'unknown' ? '날짜 미상' : formatDateStatLabel(key),
      rows: [],
      totalAmount: 0,
    };
    group.rows.push(sale);
    group.totalAmount += Number(sale.amount || 0);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function buildDailyChartStats(rows: SalesStatsPdfDailyRow[]): DailyChartStat[] {
  const normalized = (rows || [])
    .filter((row) => row && typeof row.date === 'string')
    .map((row) => ({
      date: row.date,
      amount: Number(row.net_settlement_amount || 0),
      count: Number(row.orders_count || 0),
    }))
    .filter((row) => row.amount !== 0 || row.count !== 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (normalized.length <= 8) {
    return normalized.map((row) => ({
      label: formatDateStatLabel(row.date),
      amount: row.amount,
      count: row.count,
    }));
  }

  // A campaign can run for one or two months. Keep the flea_market card
  // readable while representing the whole range instead of silently dropping
  // dates after the first eight.
  const bucketCount = 8;
  return Array.from({ length: bucketCount }, (_, index) => {
    const start = Math.floor((index * normalized.length) / bucketCount);
    const end = Math.floor(((index + 1) * normalized.length) / bucketCount) - 1;
    const bucket = normalized.slice(start, end + 1);
    const first = bucket[0];
    const last = bucket[bucket.length - 1] || first;
    return {
      label:
        first && last && first.date !== last.date
          ? `${formatMonthDay(first.date)}-${formatMonthDay(last.date)}`
          : first
            ? formatMonthDay(first.date)
            : '-',
      amount: bucket.reduce((sum, row) => sum + row.amount, 0),
      count: bucket.reduce((sum, row) => sum + row.count, 0),
    };
  });
}

function getContentX(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.left;
}

function getContentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function applyPdfFont(doc: PDFKit.PDFDocument) {
  registerPaperlogyFonts(doc);
  registerSpaceMonoFonts(doc);
  setPdfFont(doc, 'medium');
}

function registerPaperlogyFonts(doc: PDFKit.PDFDocument) {
  Object.entries(PAPERLOGY_FONT_FILES).forEach(([weight, fileName]) => {
    const fontPath = join(__dirname, '..', 'assets', 'fonts', fileName);
    if (!existsSync(fontPath)) {
      return;
    }
    try {
      doc.registerFont(PAPERLOGY_FONT_NAMES[weight as PdfFontWeight], fontPath);
    } catch {
      // Optional font weights must not block a downloadable report.
    }
  });
}

function registerSpaceMonoFonts(doc: PDFKit.PDFDocument) {
  Object.entries(SPACE_MONO_FONT_FILES).forEach(([weight, fileName]) => {
    const fontPath = join(__dirname, '..', 'assets', 'fonts', fileName);
    if (!existsSync(fontPath)) {
      return;
    }
    try {
      doc.registerFont(
        SPACE_MONO_FONT_NAMES[weight as PdfMonoFontWeight],
        fontPath,
      );
    } catch {
      // Optional mono font weights must not block a downloadable report.
    }
  });
}

function setPdfFont(doc: PDFKit.PDFDocument, weight: PdfFontWeight) {
  try {
    doc.font(PAPERLOGY_FONT_NAMES[weight]);
    return;
  } catch {
    // Fall through to the available medium/system fallback.
  }
  try {
    doc.font(PAPERLOGY_FONT_NAMES.medium);
    return;
  } catch {
    // Fall through to system fallback.
  }
  const font = resolvePdfFont();
  if (!font) {
    doc.font('Helvetica');
    return;
  }
  try {
    if (font.family) {
      doc.font(font.path, font.family);
    } else {
      doc.font(font.path);
    }
  } catch {
    doc.font('Helvetica');
  }
}

function setPdfMonoFont(
  doc: PDFKit.PDFDocument,
  weight: PdfMonoFontWeight = 'regular',
) {
  try {
    doc.font(SPACE_MONO_FONT_NAMES[weight]);
    return;
  } catch {
    // Paperlogy is safer than leaving an unregistered font selected.
  }
  setPdfFont(doc, weight === 'bold' ? 'bold' : 'regular');
}

function resolvePdfFont(): PdfFontCandidate | null {
  const candidates: PdfFontCandidate[] = [
    { path: join(__dirname, '..', 'assets', 'fonts', 'Paperlogy-5Medium.ttf') },
    { path: '/usr/share/fonts/truetype/nanum/NanumGothic.ttf' },
    {
      path: '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
      family: 'NotoSansCJKkr-Regular',
    },
    {
      path: '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
      family: 'NotoSansCJKkr-Regular',
    },
    { path: '/System/Library/Fonts/Supplemental/AppleGothic.ttf' },
    {
      path: '/System/Library/Fonts/AppleSDGothicNeo.ttc',
      family: 'AppleSDGothicNeo-Regular',
    },
  ];
  return candidates.find((candidate) => existsSync(candidate.path)) || null;
}

function formatCampaignPeriod(
  startsAt: string | null,
  endsAt: string | null,
): string {
  const start = getDateParts(startsAt);
  const end = getDateParts(endsAt);
  if (!start && !end) {
    return '-';
  }
  if (start && end) {
    const startText = `${start.year}.${start.month}.${start.day}`;
    const endText =
      start.year === end.year
        ? `${end.month}.${end.day}`
        : `${end.year}.${end.month}.${end.day}`;
    return `${startText} - ${endText}`;
  }
  const only = start || end;
  return only ? `${only.year}.${only.month}.${only.day}` : '-';
}

function getDateParts(
  value: string | null,
): { year: string; month: string; day: string } | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? { year, month, day } : null;
}

function getKoreanDateKey(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function formatDateStatLabel(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }
  return `${month}.${day} (${weekdayFormatter.format(date)})`;
}

function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return month && day ? `${month}.${day}` : dateKey;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatNumber(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString('ko-KR');
}

function formatCurrency(value: number, currencyCode: string): string {
  const normalizedCode = (currencyCode || 'KRW').toUpperCase();
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: normalizedCode,
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  } catch {
    return `${formatNumber(value)}원`;
  }
}

function formatCompactCurrency(value: number, currencyCode: string): string {
  const rounded = Math.round(Number(value) || 0);
  if (currencyCode.toUpperCase() === 'KRW' && rounded >= 10000) {
    return `${(rounded / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`;
  }
  return formatCurrency(rounded, currencyCode);
}
