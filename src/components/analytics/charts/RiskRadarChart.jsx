import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Radar } from 'react-chartjs-2'
import { SOFT_RED, SOFT_RED_HOVER } from './analyticsColors'

const LABELS = [
  'Delayed tasks %',
  'Critical faults %',
  'Critical inventory %',
  'Low worker efficiency %',
  'Overdue maintenance %',
]

function getRiskLabels(t) {
  if (!t) return LABELS
  return [
    t('riskDelayedTasksPct'),
    t('riskCriticalFaultsPct'),
    t('riskCriticalInventoryPct'),
    t('riskLowEfficiencyPct'),
    t('riskOverdueMaintenancePct'),
  ]
}

const COLOR_RISK = SOFT_RED
const COLOR_FILL = 'rgba(184,92,92,0.2)'
const COLOR_POINTS = SOFT_RED_HOVER

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
  },
  scales: {
    r: {
      beginAtZero: true,
      max: 100,
      ticks: { stepSize: 25, font: { size: 9 } },
      pointLabels: { font: { size: 10 } },
    },
  },
}

export default function RiskRadarChart({ data, t, onSegmentClick }) {
  const labels = t ? getRiskLabels(t) : (data?.labels ?? LABELS)
  const values = data?.values ?? [0, 0, 0, 0, 0]

  const chartData = {
    labels,
    datasets: [
      {
        label: t ? t('systemRisk') : 'System risk',
        data: values,
        borderColor: COLOR_RISK,
        backgroundColor: COLOR_FILL,
        pointBackgroundColor: COLOR_POINTS,
        pointHoverBackgroundColor: SOFT_RED_HOVER,
      },
    ],
  }

  const optionsWithClick = {
    ...options,
    onClick: (event, elements, chart) => {
      if (!onSegmentClick || elements.length === 0) return
      const el = elements[0]
      onSegmentClick({ axisIndex: el.index })
    },
  }

  return <Radar data={chartData} options={optionsWithClick} />
}
