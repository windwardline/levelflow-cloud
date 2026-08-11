> **Identity annotation (round 8 CV-1/FR-2, added 2026-08-11):** this document
> reads the 2026-08-10 baseline corpus, whose universe carried provider
> spellings (six ^-prefixed indices, ARUSD, OTRUMPUSD, WTI's provider name);
> getAssetType's silent forex fallback ran all nine under forex calibration,
> sessions, costs and completion conventions — ARUSD/OTRUMPUSD additionally
> took a 2-3h daily-completion look-ahead. "Forex" rows are inflated with
> non-FX symbols and indices/energies rows are absent or misplaced. The
> roster-name refleet (sweeps/4c, per-class fold spec) supersedes these
> numbers. Kept unrewritten by design: annotated evidence, not history-edit.

(holdout markets excluded: 252798 rows)
# Sweep analysis — 764936 evaluated setups
Emit: sweeps/2026-08-10-evaluator-repair-baseline.jsonl · min-n for a reportable cell: 30
Splits: select, confirm, fit · variants: baseline

## Per class — accepted setups (the engine's own live gate) vs every evaluated decision
class        live thr  acc n   acc tp1  acc stop  acc expR  all n   all tp1  all expR
-----------  --------  ------  -------  --------  --------  ------  -------  --------
agriculture  30        8756    60.8%    29.3%     -0.365    11361   60.5%    -0.402  
crypto       25        214071  60.1%    37.0%     -0.182    255030  60.0%    -0.182  
forex        20        371781  64.2%    31.0%     -0.058    437024  64.1%    -0.056  
futures      25        29965   54.9%    39.7%     -0.278    40312   56.0%    -0.309  
livestock    40        1516    54.1%    40.7%     -0.160    1972    54.2%    -0.147  
metals       30        16173   66.3%    28.5%     -0.224    19237   66.1%    -0.239  

## agriculture — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < 30)
band   n     tp1    stop   unfilled  expR    flag
-----  ----  -----  -----  --------  ------  ----
20-24  14    53.8%  30.8%  7.1%      -0.496  !   
25-29  102   50.0%  37.8%  19.6%     -0.486      
30-34  267   59.6%  28.8%  25.8%     -0.373  *   
35-39  476   59.7%  30.0%  22.9%     -0.361      
40-44  929   60.0%  30.4%  20.3%     -0.483      
45-49  1085  62.4%  27.8%  23.0%     -0.405      
50-54  957   60.3%  29.9%  21.8%     -0.375      
55-59  884   59.7%  31.1%  24.4%     -0.491      
60-64  1332  61.1%  31.0%  21.1%     -0.385      
65-69  804   57.2%  29.9%  21.8%     -0.456      
70-74  865   62.2%  30.1%  26.9%     -0.392      
75-79  1098  66.2%  24.9%  24.0%     -0.286      
80-84  732   59.3%  29.8%  22.4%     -0.433      
85-89  1109  58.4%  31.5%  24.2%     -0.400      
90-94  707   58.3%  31.6%  25.7%     -0.372      

## crypto — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < 30)
band     n      tp1    stop   unfilled  expR    flag
-------  -----  -----  -----  --------  ------  ----
20-24    88     59.0%  37.2%  11.4%     -0.277      
25-29    1750   55.2%  41.1%  13.3%     -0.310  *   
30-34    4666   56.2%  40.8%  12.1%     -0.290      
35-39    11189  58.2%  38.5%  13.4%     -0.230      
40-44    19959  59.4%  37.5%  14.6%     -0.200      
45-49    21636  60.3%  36.9%  14.0%     -0.176      
50-54    20745  59.7%  37.5%  13.6%     -0.192      
55-59    18155  58.7%  38.3%  13.6%     -0.207      
60-64    26185  58.8%  38.4%  13.0%     -0.211      
65-69    22327  60.1%  36.9%  13.7%     -0.168      
70-74    20825  61.3%  36.0%  13.6%     -0.155      
75-79    24190  60.1%  37.1%  13.7%     -0.191      
80-84    14316  62.2%  34.7%  14.9%     -0.130      
85-89    31956  58.4%  38.4%  13.6%     -0.227      
90-94    11900  64.5%  32.5%  14.5%     -0.044      
95-99    4687   72.0%  25.0%  15.6%     0.090       
100-104  456    61.0%  33.0%  11.6%     0.038       

## forex — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < 30)
band   n      tp1    stop   unfilled  expR    flag
-----  -----  -----  -----  --------  ------  ----
15-19  51     65.0%  30.0%  21.6%     -0.044      
20-24  794    58.6%  35.2%  8.8%      -0.175  *   
25-29  3439   61.0%  34.0%  9.0%      -0.118      
30-34  10422  62.6%  32.4%  10.6%     -0.092      
35-39  19803  63.5%  31.6%  12.1%     -0.076      
40-44  30373  63.6%  31.4%  13.0%     -0.061      
45-49  36223  63.4%  31.8%  12.8%     -0.063      
50-54  37559  63.9%  31.3%  13.4%     -0.056      
55-59  35221  63.7%  31.3%  12.5%     -0.064      
60-64  40782  63.9%  31.2%  12.5%     -0.067      
65-69  42438  64.4%  30.6%  13.2%     -0.046      
70-74  38471  64.4%  30.8%  13.5%     -0.051      
75-79  34356  65.2%  30.2%  13.6%     -0.044      
80-84  29838  64.8%  30.8%  13.8%     -0.043      
85-89  41424  64.0%  31.2%  12.4%     -0.064      
90-94  26747  64.4%  31.2%  13.4%     -0.043      
95-99  9083   69.1%  27.7%  17.2%     0.041       

## futures — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < 30)
band   n     tp1     stop   unfilled  expR    flag
-----  ----  ------  -----  --------  ------  ----
10-14  2     100.0%  0.0%   50.0%     0.152   !   
15-19  23    60.0%   40.0%  13.0%     -0.576  !   
20-24  216   48.7%   43.9%  13.4%     -0.425      
25-29  723   56.9%   36.8%  18.8%     -0.324  *   
30-34  1269  55.8%   38.3%  15.6%     -0.335      
35-39  2200  56.2%   38.4%  17.3%     -0.337      
40-44  3382  55.9%   37.9%  17.2%     -0.316      
45-49  3511  55.6%   38.9%  17.9%     -0.316      
50-54  3534  56.4%   38.0%  17.9%     -0.304      
55-59  4110  54.0%   41.2%  17.0%     -0.343      
60-64  4144  56.7%   37.8%  16.6%     -0.320      
65-69  2878  55.8%   38.5%  18.0%     -0.285      
70-74  3505  55.7%   38.7%  18.4%     -0.332      
75-79  2803  56.9%   37.5%  17.2%     -0.305      
80-84  4647  56.9%   36.3%  16.3%     -0.298      
85-89  1838  55.5%   39.5%  17.4%     -0.236      
90-94  1383  56.8%   38.7%  16.5%     -0.229      
95-99  144   59.1%   37.3%  23.6%     0.016       

## livestock — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < 30)
band   n    tp1    stop   unfilled  expR    flag
-----  ---  -----  -----  --------  ------  ----
25-29  12   30.0%  60.0%  16.7%     -0.677  !   
30-34  48   55.6%  33.3%  25.0%     -0.014      
35-39  68   51.9%  44.2%  23.5%     -0.195      
40-44  134  53.2%  45.7%  29.9%     -0.150  *   
45-49  184  50.7%  45.2%  20.7%     -0.095      
50-54  182  54.4%  42.6%  25.3%     -0.354      
55-59  172  48.5%  44.1%  20.9%     -0.295      
60-64  230  55.1%  38.3%  27.4%     0.000       
65-69  158  61.4%  32.5%  27.8%     0.002       
70-74  115  42.6%  51.1%  18.3%     -0.347      
75-79  190  56.9%  37.5%  24.2%     -0.094      
80-84  125  59.2%  38.8%  21.6%     -0.090      
85-89  188  58.7%  34.3%  23.9%     0.020       
90-94  160  56.6%  38.9%  29.4%     -0.285      
95-99  6    50.0%  0.0%   33.3%     -0.168  !   

## metals — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < 30)
band   n     tp1    stop    unfilled  expR    flag
-----  ----  -----  ------  --------  ------  ----
15-19  1     0.0%   100.0%  0.0%      -1.237  !   
20-24  7     83.3%  16.7%   14.3%     -0.221  !   
25-29  121   63.2%  30.5%   21.5%     -0.291      
30-34  442   67.5%  28.4%   17.2%     -0.270  *   
35-39  947   64.3%  31.8%   16.9%     -0.278      
40-44  1154  66.5%  27.5%   21.4%     -0.224      
45-49  1921  67.6%  27.9%   18.1%     -0.239      
50-54  1599  62.9%  31.4%   18.3%     -0.295      
55-59  1365  64.3%  30.6%   19.0%     -0.279      
60-64  2061  68.1%  27.7%   18.4%     -0.236      
65-69  1470  65.8%  28.2%   21.8%     -0.228      
70-74  1656  65.2%  28.6%   19.9%     -0.238      
75-79  1777  66.0%  28.1%   18.8%     -0.244      
80-84  1012  64.6%  30.6%   20.5%     -0.232      
85-89  1856  66.7%  27.9%   21.4%     -0.189      
90-94  1779  68.7%  28.0%   16.8%     -0.202      
95-99  69    64.9%  26.3%   17.4%     -0.026      

## agriculture — threshold sensitivity (all evaluated decisions at or above each candidate)
thr  n      tp1    stop   expR    flag
---  -----  -----  -----  ------  ----
35   10978  60.6%  29.8%  -0.402      
40   10502  60.7%  29.7%  -0.404      
45   9573   60.7%  29.7%  -0.396      
50   8488   60.5%  29.9%  -0.395      
55   7531   60.5%  29.9%  -0.397      
60   6647   60.7%  29.8%  -0.385      
65   5315   60.5%  29.4%  -0.385      
68   4710   61.0%  29.5%  -0.373      
70   4511   61.2%  29.3%  -0.372      
75   3646   60.9%  29.2%  -0.367      
80   2548   58.6%  31.0%  -0.402      
82   2216   58.5%  31.4%  -0.401      
85   1816   58.3%  31.6%  -0.389      
90   707    58.3%  31.6%  -0.372      
95   0      —      —      —        !  

## crypto — threshold sensitivity (all evaluated decisions at or above each candidate)
thr  n       tp1    stop   expR    flag
---  ------  -----  -----  ------  ----
35   248526  60.1%  36.9%  -0.179      
40   237337  60.2%  36.8%  -0.176      
45   217378  60.3%  36.8%  -0.174      
50   195742  60.3%  36.8%  -0.174      
55   174997  60.4%  36.7%  -0.172      
60   156842  60.6%  36.5%  -0.168      
65   130657  60.9%  36.1%  -0.159      
68   116780  61.1%  35.9%  -0.157      
70   108330  61.1%  35.9%  -0.158      
75   87505   61.0%  35.9%  -0.158      
80   63315   61.4%  35.5%  -0.146      
82   56871   61.4%  35.5%  -0.147      
85   48999   61.2%  35.7%  -0.150      
90   17043   66.5%  30.5%  -0.005      
95   5143    71.0%  25.7%  0.086       

## forex — threshold sensitivity (all evaluated decisions at or above each candidate)
thr  n       tp1    stop   expR    flag
---  ------  -----  -----  ------  ----
35   422318  64.2%  31.0%  -0.054      
40   402515  64.2%  31.0%  -0.053      
45   372142  64.3%  31.0%  -0.052      
50   335919  64.4%  30.9%  -0.051      
55   298360  64.5%  30.8%  -0.051      
60   263139  64.6%  30.8%  -0.049      
65   222357  64.7%  30.7%  -0.046      
68   197027  64.7%  30.7%  -0.046      
70   179919  64.7%  30.7%  -0.046      
75   141448  64.8%  30.6%  -0.044      
80   107092  64.7%  30.8%  -0.045      
82   95218   64.6%  30.8%  -0.045      
85   77254   64.7%  30.8%  -0.045      
90   35830   65.5%  30.3%  -0.023      
95   9083    69.1%  27.7%  0.041       

## futures — threshold sensitivity (all evaluated decisions at or above each candidate)
thr  n      tp1    stop   expR    flag
---  -----  -----  -----  ------  ----
35   38079  56.0%  38.4%  -0.307      
40   35879  56.0%  38.4%  -0.306      
45   32497  56.0%  38.4%  -0.304      
50   28986  56.1%  38.4%  -0.303      
55   25452  56.0%  38.4%  -0.303      
60   21342  56.4%  37.9%  -0.295      
65   17198  56.3%  37.9%  -0.289      
68   15303  56.3%  37.9%  -0.289      
70   14320  56.4%  37.8%  -0.290      
75   10815  56.7%  37.5%  -0.277      
80   8012   56.6%  37.5%  -0.267      
82   6589   57.0%  37.2%  -0.258      
85   3365   56.2%  39.1%  -0.223      
90   1527   57.0%  38.6%  -0.208      
95   144    59.1%  37.3%  0.016       

## livestock — threshold sensitivity (all evaluated decisions at or above each candidate)
thr  n     tp1    stop   expR    flag  
---  ----  -----  -----  ------  ------
35   1912  54.3%  40.5%  -0.146        
40   1844  54.4%  40.4%  -0.145  * live
45   1710  54.5%  40.0%  -0.144        
50   1526  55.0%  39.3%  -0.150        
55   1344  55.1%  38.9%  -0.123        
60   1172  56.1%  38.1%  -0.096        
65   942   56.3%  38.0%  -0.119        
68   826   55.8%  38.7%  -0.130        
70   784   55.4%  39.1%  -0.142        
75   669   57.8%  36.9%  -0.104        
80   479   58.1%  36.6%  -0.109        
82   419   57.6%  36.7%  -0.127        
85   354   57.7%  35.8%  -0.116        
90   166   56.4%  37.6%  -0.281        
95   6     50.0%  0.0%   -0.168   !    

## metals — threshold sensitivity (all evaluated decisions at or above each candidate)
thr  n      tp1    stop   expR    flag
---  -----  -----  -----  ------  ----
35   18666  66.1%  28.8%  -0.238      
40   17719  66.2%  28.6%  -0.235      
45   16565  66.2%  28.7%  -0.236      
50   14644  66.0%  28.8%  -0.236      
55   13045  66.4%  28.5%  -0.228      
60   11680  66.7%  28.3%  -0.222      
65   9619   66.3%  28.4%  -0.219      
68   8574   66.5%  28.4%  -0.217      
70   8149   66.4%  28.4%  -0.218      
75   6493   66.7%  28.4%  -0.213      
80   4716   67.0%  28.5%  -0.200      
82   4373   67.3%  28.2%  -0.195      
85   3704   67.6%  27.9%  -0.192      
90   1848   68.6%  27.9%  -0.195      
95   69     64.9%  26.3%  -0.026      

## Per symbol (NEW marks a market Phase 5 made sizeable for the first time)
symbol     class        acc n  acc tp1  acc expR  all n  all expR  flag
---------  -----------  -----  -------  --------  -----  --------  ----
^AXJO      forex        769    51.3%    -0.151    978    -0.172        
^DJI       forex        808    55.1%    -0.054    1080   -0.046        
^GDAXI     forex        1142   56.2%    -0.088    1417   -0.103        
^GSPC      forex        1948   52.1%    -0.109    2444   -0.092        
^NDX       forex        1787   52.2%    -0.060    2230   -0.050        
AAVEUSD    crypto       6876   59.6%    -0.178    8321   -0.180        
ADAUSD     crypto       10832  59.5%    -0.162    12068  -0.159    NEW 
ALGOUSD    crypto       8497   55.2%    -0.243    10084  -0.235        
ARUSD      forex        3447   44.6%    -0.223    4054   -0.234        
ATOMUSD    crypto       8369   58.3%    -0.210    10213  -0.206        
AUDCAD     forex        18128  68.3%    -0.027    22424  -0.018        
AUDNZD     forex        18137  69.8%    -0.008    21354  -0.007        
AVAXUSD    crypto       6352   59.2%    -0.204    7083   -0.203        
BTCUSD     crypto       12662  68.3%    -0.121    14934  -0.145    NEW 
BZUSD      futures      1967   51.5%    -0.185    2466   -0.187        
CADCHF     forex        19084  66.9%    -0.027    22277  -0.027        
CAKEUSD    crypto       3605   42.2%    -0.554    4289   -0.561        
CHFJPY     forex        19474  63.9%    -0.057    22453  -0.052        
CLUSD      futures      2079   54.1%    -0.170    2675   -0.161        
DASHUSD    crypto       11291  59.0%    -0.168    13753  -0.166        
DOGEUSD    crypto       9438   62.4%    -0.117    11221  -0.111    NEW 
DOTUSD     crypto       6549   60.3%    -0.196    7521   -0.202        
DYDXUSD    crypto       4121   39.3%    -0.276    5036   -0.283        
EGLDUSD    crypto       5951   50.8%    -0.279    6772   -0.262        
ESUSD      futures      1988   59.3%    -0.305    2777   -0.294        
ETCUSD     crypto       10712  64.3%    -0.113    12815  -0.102        
ETHUSD     crypto       12407  66.8%    -0.097    14341  -0.096    NEW 
EURAUD     forex        19133  64.9%    -0.057    22396  -0.056        
EURCAD     forex        19177  66.1%    -0.052    22544  -0.051        
EURJPY     forex        19398  63.1%    -0.076    22531  -0.071        
EURNZD     forex        19277  66.4%    -0.032    22322  -0.034        
GBPAUD     forex        18669  63.2%    -0.055    22456  -0.043        
GBPCAD     forex        18457  64.6%    -0.056    22338  -0.062        
GBPNZD     forex        18895  65.6%    -0.028    22323  -0.029        
GBPUSD     forex        19206  61.2%    -0.118    22442  -0.112        
GCUSD      futures      2345   59.8%    -0.175    2753   -0.167        
GFUSX      livestock    540    55.4%    -0.153    682    -0.171        
GRTUSD     crypto       7478   57.6%    -0.180    8540   -0.172        
HBARUSD    crypto       4828   57.3%    -0.254    5664   -0.245        
HEUSX      livestock    510    53.2%    -0.140    619    -0.108        
HGUSD      futures      2270   54.3%    -0.238    2681   -0.230        
HOUSD      futures      1852   30.5%    -0.490    2249   -0.473        
IMXUSD     crypto       5654   54.7%    -0.219    6615   -0.215        
LEUSX      livestock    466    53.6%    -0.188    671    -0.157        
LINKUSD    crypto       8822   62.1%    -0.153    10536  -0.141        
LTCUSD     crypto       11189  66.4%    -0.106    13717  -0.093    NEW 
NZDCAD     forex        18632  67.1%    -0.010    22217  -0.016        
NZDCHF     forex        18395  67.5%    -0.008    21931  -0.002        
NZDJPY     forex        18785  62.7%    -0.052    22197  -0.054        
NZDUSD     forex        19287  62.6%    -0.051    22212  -0.051        
OTRUMPUSD  forex        1801   63.2%    -0.011    1924   -0.019        
PAUSD      futures      2155   50.2%    -0.160    2660   -0.140        
PLUSD      futures      2195   57.8%    -0.123    2794   -0.126        
RBUSD      futures      1760   32.3%    -0.429    2125   -0.503        
RTYUSD     futures      2073   52.3%    -0.261    2701   -0.254        
SIUSD      futures      2312   58.8%    -0.128    2704   -0.138        
SOLUSD     crypto       7648   61.3%    -0.151    8671   -0.151    NEW 
THETAUSD   crypto       3651   41.5%    -0.440    4057   -0.446        
TRXUSD     crypto       8972   59.1%    -0.296    12475  -0.348        
UNIUSD     crypto       6827   57.3%    -0.228    8382   -0.219        
USDCAD     forex        19050  61.4%    -0.136    22194  -0.129        
USDCHF     forex        19086  61.9%    -0.096    21854  -0.094        
USDJPY     forex        19809  59.9%    -0.123    22432  -0.116        
XAGUSD     metals       3054   63.3%    -0.150    3573   -0.154    NEW 
XAUUSD     metals       13119  67.0%    -0.242    15664  -0.258        
XMRUSD     crypto       10521  60.7%    -0.175    13335  -0.172        
XRPUSD     crypto       11115  66.9%    -0.110    12913  -0.110    NEW 
XTZUSD     crypto       9704   60.6%    -0.144    11674  -0.128        
YMUSD      futures      1912   54.4%    -0.373    2779   -0.373        
ZBUSD      futures      2148   68.0%    -0.380    2452   -0.370        
ZCUSX      agriculture  1808   68.2%    -0.376    2209   -0.372        
ZFUSD      futures      680    63.9%    -0.686    2658   -0.724        
ZLUSX      agriculture  2360   56.4%    -0.338    2820   -0.348        
ZMUSD      agriculture  2214   63.0%    -0.379    2682   -0.374        
ZNUSD      futures      2141   71.1%    -0.485    2558   -0.475        
ZRUSD      agriculture  692    51.1%    -0.215    865    -0.360        
ZSUSX      agriculture  1682   59.2%    -0.423    2785   -0.517        
ZTUSD      futures      88     78.2%    -0.677    1280   -0.751        

## regime — accepted setups only (the lever's own re-measurement)
regime       n       tp1    stop   expR    flag
-----------  ------  -----  -----  ------  ----
compression  145808  63.2%  32.3%  -0.120      
range        248956  62.2%  33.6%  -0.112      
trend        247498  62.1%  33.7%  -0.120      

## session — accepted setups only (the lever's own re-measurement)
session                              n       tp1    stop   expR    flag
-----------------------------------  ------  -----  -----  ------  ----
Continuous digital asset session     214071  60.1%  37.0%  -0.182      
Grain session                        8756    60.8%  29.3%  -0.365      
Late Friday FX session               16      0.0%   40.0%  -0.733  !   
Late Friday primary futures session  44      0.0%   33.3%  -0.300      
Late Friday spot metals session      1       —      —      —       !   
Late-session risk                    12443   63.8%  32.0%  -0.090      
Livestock session                    1516    54.1%  40.7%  -0.160      
London open                          32435   60.8%  34.1%  -0.071      
London/New York overlap              65622   65.2%  28.0%  -0.041      
Normal session                       261265  64.4%  31.3%  -0.060      
Primary futures session              29921   54.9%  39.7%  -0.278      
Spot metals session                  16172   66.3%  28.5%  -0.224      

## stop provenance — accepted setups only (the lever's own re-measurement)
stop provenance   n       tp1    stop   expR    flag
----------------  ------  -----  -----  ------  ----
cap               640240  62.4%  33.4%  -0.117      
pivot             1677    67.4%  25.6%  -0.135      
volatility_floor  345     65.3%  29.0%  -0.162      

## COT stance — accepted setups only (the lever's own re-measurement)
COT stance     n       tp1    stop   expR    flag
-------------  ------  -----  -----  ------  ----
crowded_long   83260   64.0%  31.1%  -0.085      
crowded_short  64151   63.1%  32.2%  -0.086      
neutral        258752  64.9%  30.4%  -0.070      
unavailable    236099  58.9%  37.8%  -0.190      

## news penalty — accepted setups only (the lever's own re-measurement)
news penalty  n       tp1    stop   expR    flag
------------  ------  -----  -----  ------  ----
clear         452546  62.9%  33.0%  -0.113      
penalized     189716  61.1%  34.2%  -0.126      

## Walk-forward split agreement — a candidate that holds on one split only is curve-fitting
class        split    n       tp1    expR    flag
-----------  -------  ------  -----  ------  ----
agriculture  confirm  8756    60.8%  -0.365      
crypto       confirm  133319  57.0%  -0.256      
crypto       fit      11167   68.3%  0.076       
crypto       select   69585   64.8%  -0.079      
forex        confirm  101156  65.3%  -0.042      
forex        fit      184120  62.7%  -0.073      
forex        select   86505   66.1%  -0.046      
futures      confirm  29965   54.9%  -0.278      
livestock    confirm  1516    54.1%  -0.160      
metals       confirm  7591    64.9%  -0.193      
metals       fit      4660    66.4%  -0.265      
metals       select   3922    69.0%  -0.236      
