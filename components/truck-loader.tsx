import styles from "./truck-loader.module.css";

type CarrierCarProps = {
  x: number;
  y: number;
  scale?: number;
  body: string;
};

function CarrierCar({ x, y, scale = 1, body }: CarrierCarProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M3 18.4h3.4l4.8-7.1c1-1.5 2.8-2.4 4.6-2.4h14.1c1.8 0 3.4.8 4.5 2.2l5.5 7.3h2.7c1.6 0 2.9 1.3 2.9 2.9v3.9H0v-4c0-1.5 1.3-2.8 3-2.8Z"
        fill={body}
        stroke="#243640"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="m13.5 10.7-4.6 7.5h26.6l-5.8-7.5H13.5Z"
        fill="#9fc5d9"
        stroke="#243640"
        strokeWidth="1"
      />
      <path d="M22.2 10.8v7.3" stroke="#48606e" strokeWidth=".9" />
      <path d="M7 20.3h31" stroke="#ffffff" strokeOpacity=".55" strokeWidth=".8" />
      <rect x="2.4" y="19.6" width="4" height="2" rx=".7" fill="#f5d166" />
      <rect x="38.6" y="19.6" width="4" height="2" rx=".7" fill="#c53e45" />
      <circle cx="10" cy="25" r="4" fill="#202e36" />
      <circle cx="10" cy="25" r="1.8" fill="#b7c3ca" />
      <circle cx="35" cy="25" r="4" fill="#202e36" />
      <circle cx="35" cy="25" r="1.8" fill="#b7c3ca" />
    </g>
  );
}

function Wheel({ cx, cy, r = 10 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#1d2a31" stroke="#10191e" strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r={r * 0.58} fill="#aebbc3" stroke="#526570" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r * 0.24} fill="#e3e8eb" stroke="#687b86" strokeWidth=".8" />
      <circle cx={cx - r * 0.24} cy={cy} r=".75" fill="#526570" />
      <circle cx={cx + r * 0.24} cy={cy} r=".75" fill="#526570" />
      <circle cx={cx} cy={cy - r * 0.24} r=".75" fill="#526570" />
      <circle cx={cx} cy={cy + r * 0.24} r=".75" fill="#526570" />
    </g>
  );
}

export function TruckLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className={styles.loadingState} role="status" aria-live="polite">
      <div className={styles.loader} aria-hidden="true">
        <div className={styles.truckWrapper}>
          <div className={styles.truckBody}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 320 135"
              className={styles.trucksvg}
            >
              <defs>
                <linearGradient id="carrierCabPaint" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset=".58" stopColor="#f2f5f6" />
                  <stop offset="1" stopColor="#dbe2e6" />
                </linearGradient>
                <linearGradient id="carrierFrame" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#173f59" />
                  <stop offset=".52" stopColor="#0e334d" />
                  <stop offset="1" stopColor="#09283d" />
                </linearGradient>
                <linearGradient id="carrierGlass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#b8d7e6" />
                  <stop offset=".55" stopColor="#7ca8be" />
                  <stop offset="1" stopColor="#476d82" />
                </linearGradient>
                <linearGradient id="carrierSteel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#eef2f4" />
                  <stop offset="1" stopColor="#aebdc5" />
                </linearGradient>
              </defs>

              <ellipse cx="163" cy="119" rx="139" ry="7" fill="#0b2638" opacity=".09" />

              <g strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M18 101h207l10-7h26v10H18Z"
                  fill="url(#carrierFrame)"
                  stroke="#243640"
                  strokeWidth="2"
                />
                <path d="M23 95h197" stroke="#6d8390" strokeWidth="1.3" />
                <path d="M22 98h198" stroke="#b9c6cd" strokeWidth="1" strokeDasharray="12 4" opacity=".8" />

                <path
                  d="M28 61h177l16 8-5 15H20l5-18c.7-2.9 1.7-4.2 3-5Z"
                  fill="url(#carrierSteel)"
                  stroke="#314752"
                  strokeWidth="2"
                />
                <path d="M28 62h176l17 8" fill="none" stroke="#163e58" strokeWidth="3" />
                <path d="M22 83h195" fill="none" stroke="#163e58" strokeWidth="3" />

                <path d="M35 62 29 83M87 62 84 83M139 62 137 83M190 62 190 83M213 66 207 83" stroke="#5d727e" strokeWidth="1.5" />
                <path d="M34 62v-7M86 62v-7M138 62v-7M190 62v-7" stroke="#314752" strokeWidth="1.4" />

                <CarrierCar x={34} y={26} scale={0.82} body="#f4f6f7" />
                <CarrierCar x={78} y={26} scale={0.82} body="#d7e0e5" />
                <CarrierCar x={122} y={26} scale={0.82} body="#eef2f4" />
                <CarrierCar x={166} y={26} scale={0.82} body="#cbd8df" />

                <CarrierCar x={49} y={62} scale={0.77} body="#edf1f3" />
                <CarrierCar x={96} y={62} scale={0.77} body="#d5e0e6" />
                <CarrierCar x={143} y={62} scale={0.77} body="#f6f7f7" />

                <path
                  d="M224 51h34c5.8 0 11.3 2.2 15.5 6.2l24 22.7c3.5 3.3 5.5 7.9 5.5 12.7V105h-84l2.8-32.7c.7-8 1.4-13.5 2.2-16.5.7-2.8 1.8-4.8 4-4.8Z"
                  fill="url(#carrierCabPaint)"
                  stroke="#243640"
                  strokeWidth="2.4"
                />

                <path
                  d="M235 57h22.5c3.4 0 6.6 1.2 9 3.5L284 77h-52l1.8-13.2c.5-3.7.9-5.4 1.2-6.8Z"
                  fill="url(#carrierGlass)"
                  stroke="#243640"
                  strokeWidth="1.6"
                />
                <path d="M260 58v19" stroke="#314752" strokeWidth="1.35" />
                <path d="M232 80h56" stroke="#bcc9cf" strokeWidth="1.2" />

                <path d="M219 87h84" stroke="#cbd5da" strokeWidth="1" />
                <path d="M221 93h82" stroke="#e0e6e9" strokeWidth="1" />
                <path d="M222 99h78" stroke="#c5d0d6" strokeWidth="1" />

                <path d="M291 80h10v9h-11.5Z" fill="#f1ca57" stroke="#243640" strokeWidth="1" />
                <rect x="225" y="88" width="6" height="5" rx="1.1" fill="#c73b43" />
                <path d="M224 97h78" stroke="#143f5d" strokeWidth="4" />
                <path d="M224 93h78" stroke="#c8333c" strokeWidth="2.2" />

                <path d="M218 63h-10l-4 8h12" fill="none" stroke="#243640" strokeWidth="1.5" />
                <circle cx="209" cy="70" r="2" fill="#3a4d58" />
                <rect x="238" y="48" width="6" height="3" rx="1" fill="#f1a72f" />
                <rect x="251" y="48" width="6" height="3" rx="1" fill="#f1a72f" />
                <rect x="264" y="50" width="6" height="3" rx="1" fill="#f1a72f" />

                <text
                  x="238"
                  y="90"
                  fontFamily="Arial, sans-serif"
                  fontSize="7"
                  fontWeight="800"
                  letterSpacing=".7"
                  fill="#123c58"
                >
                  CENTRAL
                </text>

                <path d="M233 101h68" stroke="#8698a3" strokeWidth="1.2" />
                <rect x="294" y="97" width="9" height="5" rx="1" fill="#d8dde0" stroke="#243640" strokeWidth=".9" />

                <Wheel cx={56} cy={108} r={10.5} />
                <Wheel cx={184} cy={108} r={10.5} />
                <Wheel cx={208} cy={108} r={10.5} />
                <Wheel cx={273} cy={108} r={11} />
              </g>
            </svg>
          </div>
          <div className={styles.road} />
          <svg
            viewBox="0 0 453.459 453.459"
            xmlns="http://www.w3.org/2000/svg"
            fill="#000000"
            className={styles.lampPost}
          >
            <path d="M252.882,0c-37.781,0-68.686,29.953-70.245,67.358h-6.917v8.954c-26.109,2.163-45.463,10.011-45.463,19.366h9.993c-1.65,5.146-2.507,10.54-2.507,16.017c0,28.956,23.558,52.514,52.514,52.514c28.956,0,52.514-23.558,52.514-52.514c0-5.478-0.856-10.872-2.506-16.017h9.992c0-9.354-19.352-17.204-45.463-19.366v-8.954h-6.149C200.189,38.779,223.924,16,252.882,16c29.952,0,54.32,24.368,54.32,54.32c0,28.774-11.078,37.009-25.105,47.437c-17.444,12.968-37.216,27.667-37.216,78.884v113.914h-0.797c-5.068,0-9.174,4.108-9.174,9.177c0,2.844,1.293,5.383,3.321,7.066c-3.432,27.933-26.851,95.744-8.226,115.459v11.202h45.75v-11.202c18.625-19.715-4.794-87.527-8.227-115.459c2.029-1.683,3.322-4.223,3.322-7.066c0-5.068-4.107-9.177-9.176-9.177h-0.795V196.641c0-43.174,14.942-54.283,30.762-66.043c14.793-10.997,31.559-21.461,31.559-60.277C323.202,31.545,291.656,0,252.882,0zM232.77,111.694c0,23.442-19.071,42.514-42.514,42.514c-23.442,0-42.514-19.072-42.514-42.514c0-5.531,1.078-10.957,3.141-16.017h78.747C231.693,100.736,232.77,106.162,232.77,111.694z" />
          </svg>
        </div>
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
