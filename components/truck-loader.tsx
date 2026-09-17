import styles from "./truck-loader.module.css";

function CarrierCar({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M2 14.5h2.8l3.5-5.2c.8-1.2 2.1-1.9 3.6-1.9h12.4c1.4 0 2.7.6 3.5 1.7l4.2 5.4h2.6c1.3 0 2.4 1.1 2.4 2.4v3.2H0v-3.5c0-1.2.9-2.1 2-2.1Z"
        fill="#e9eef2"
        stroke="#263640"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="m10.1 9.1-3.2 5.2h19.8l-4-5.2H10.1Z" fill="#a9c7d8" stroke="#263640" strokeWidth="1.05" />
      <path d="M17 9.2v5" stroke="#263640" strokeWidth="1" />
      <circle cx="8" cy="20" r="3.1" fill="#263640" />
      <circle cx="8" cy="20" r="1.25" fill="#c7d2d9" />
      <circle cx="29" cy="20" r="3.1" fill="#263640" />
      <circle cx="29" cy="20" r="1.25" fill="#c7d2d9" />
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
              viewBox="0 0 270 118"
              className={styles.trucksvg}
            >
              <defs>
                <linearGradient id="carrierCab" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#edf2f5" />
                </linearGradient>
                <linearGradient id="carrierBlue" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#153f5c" />
                  <stop offset="1" stopColor="#0c2f47" />
                </linearGradient>
              </defs>

              <g strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M18 84h177l13-42h29l22 22v28h-27"
                  fill="none"
                  stroke="#243640"
                  strokeWidth="3"
                />
                <path d="M20 86h180v8H20z" fill="url(#carrierBlue)" stroke="#243640" strokeWidth="2" />
                <path d="M25 48h174l-7 27H19z" fill="#f7f9fa" stroke="#243640" strokeWidth="2.2" />
                <path d="M29 50h165" stroke="#6c7e89" strokeWidth="1.3" />
                <path d="M22 77h172" stroke="#6c7e89" strokeWidth="1.3" />
                <path d="M38 47 28 77M93 47 89 77M147 47l-4 30M198 47l-8 30" stroke="#50636e" strokeWidth="1.35" />

                <CarrierCar x={38} y={22} scale={0.9} />
                <CarrierCar x={93} y={22} scale={0.9} />
                <CarrierCar x={148} y={22} scale={0.9} />
                <CarrierCar x={54} y={54} scale={0.82} />
                <CarrierCar x={108} y={54} scale={0.82} />
                <CarrierCar x={160} y={54} scale={0.82} />

                <path
                  d="M204 45h31l22 21v26h-60l3-31 4-16Z"
                  fill="url(#carrierCab)"
                  stroke="#243640"
                  strokeWidth="2.4"
                />
                <path
                  d="M211 50h20l15 15h-38l1.8-11.5c.3-2 1.1-3.5 1.2-3.5Z"
                  fill="#9fc4d7"
                  stroke="#243640"
                  strokeWidth="1.6"
                />
                <path d="M230 50v15" stroke="#243640" strokeWidth="1.4" />
                <path d="M199 76h58" stroke="#cbd5dc" strokeWidth="1.3" />
                <path d="M199 81h58" stroke="#d9e1e6" strokeWidth="1" />
                <rect x="248" y="69" width="8" height="5" rx="1.5" fill="#ffd45a" stroke="#243640" strokeWidth="1.2" />
                <path d="M204 86h52" stroke="#143f5d" strokeWidth="4" />
                <path d="M204 82h52" stroke="#c8333c" strokeWidth="2.2" />

                <text
                  x="215"
                  y="79"
                  fontFamily="Arial, sans-serif"
                  fontSize="6.5"
                  fontWeight="800"
                  letterSpacing=".6"
                  fill="#123c58"
                >
                  CENTRAL
                </text>

                <g>
                  <circle cx="48" cy="96" r="10" fill="#263640" />
                  <circle cx="48" cy="96" r="4.4" fill="#bfcbd2" />
                  <circle cx="184" cy="96" r="10" fill="#263640" />
                  <circle cx="184" cy="96" r="4.4" fill="#bfcbd2" />
                  <circle cx="231" cy="96" r="10" fill="#263640" />
                  <circle cx="231" cy="96" r="4.4" fill="#bfcbd2" />
                </g>
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
            <path d="M252.882,0c-37.781,0-68.686,29.953-70.245,67.358h-6.917v8.954c-26.109,2.163-45.463,10.011-45.463,19.366h9.993c-1.65,5.146-2.507,10.54-2.507,16.017c0,28.956,23.558,52.514,52.514,52.514c28.956,0,52.514-23.558,52.514-52.514c0-5.478-0.856-10.872-2.506-16.017h9.992c0-9.354-19.352-17.204-45.463-19.366v-8.954h-6.149C200.189,38.779,223.924,16,252.882,16c29.952,0,54.32,24.368,54.32,54.32c0,28.774-11.078,37.009-25.105,47.437c-17.444,12.968-37.216,27.667-37.216,78.884v113.914h-0.797c-5.068,0-9.174,4.108-9.174,9.177c0,2.844,1.293,5.383,3.321,7.066c-3.432,27.933-26.851,95.744-8.226,115.459v11.202h45.75v-11.202c18.625-19.715-4.794-87.527-8.227-115.459c2.029-1.683,3.322-4.223,3.322-7.066c0-5.068-4.107-9.177-9.176-9.177h-0.795V196.641c0-43.174,14.942-54.283,30.762-66.043c14.793-10.997,31.559-23.461,31.559-60.277C323.202,31.545,291.656,0,252.882,0zM232.77,111.694c0,23.442-19.071,42.514-42.514,42.514c-23.442,0-42.514-19.072-42.514-42.514c0-5.531,1.078-10.957,3.141-16.017h78.747C231.693,100.736,232.77,106.162,232.77,111.694z" />
          </svg>
        </div>
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
