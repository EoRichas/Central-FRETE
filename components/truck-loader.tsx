import styles from "./truck-loader.module.css";

export function TruckLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className={styles.loadingState} role="status" aria-live="polite">
      <div className={styles.loader} aria-hidden="true">
        <div className={styles.truckWrapper}>
          <div className={styles.truckBody}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 230 105"
              className={styles.trucksvg}
            >
              <g
                fill="none"
                stroke="#282828"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path fill="#ffffff" d="M162 44h34l20 18v23h-54z" />
                <path fill="#dce7ec" d="M174 51h18l13 12h-31z" />
                <path d="M168 74h42" />

                <path fill="#2f566d" d="M10 74h151v11H10z" />
                <path d="M18 70 34 43h116l14 31" />
                <path d="M34 43h112M39 40h108M31 55h128" />
                <path d="M47 43v12M83 43v12M119 43v12M150 43v12" />

                <g fill="#e9eef1">
                  <path d="M40 36h27l7 7H34z" />
                  <path d="M82 36h27l7 7H76z" />
                  <path d="M124 36h27l7 7H118z" />
                  <path d="M54 57h27l7 7H48z" />
                  <path d="M98 57h27l7 7H92z" />
                </g>

                <g fill="#282828">
                  <circle cx="50" cy="89" r="9" />
                  <circle cx="50" cy="89" r="4" fill="#dfe5e8" />
                  <circle cx="144" cy="89" r="9" />
                  <circle cx="144" cy="89" r="4" fill="#dfe5e8" />
                  <circle cx="197" cy="89" r="9" />
                  <circle cx="197" cy="89" r="4" fill="#dfe5e8" />
                </g>
              </g>

              <text
                x="168"
                y="72"
                fontFamily="Arial, sans-serif"
                fontSize="6"
                fontWeight="700"
                fill="#0b2638"
              >
                CENTRAL
              </text>
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
