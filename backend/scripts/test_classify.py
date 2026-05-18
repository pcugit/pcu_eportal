from utils.payment_status import classify_response, PENDING_CODES, FAIL_AFTER_REQUERIES

print('PENDING_CODES:', PENDING_CODES)
print('FAIL_AFTER_REQUERIES:', FAIL_AFTER_REQUERIES)

cases = [
    ('00',  0, 'successful'),
    ('Z0',  0, 'pending'),
    ('T0',  0, 'pending'),
    ('',    0, 'pending'),
    ('01',  0, 'pending'),   # first non-success non-pending
    ('01',  1, 'pending'),   # second attempt
    ('01',  2, 'failed'),    # third attempt => fail
    ('X9',  2, 'failed'),
    ('Z0',  5, 'pending'),   # Z0 always stays pending regardless of count
]

all_pass = True
for code, cnt, expected in cases:
    result = classify_response(code, cnt)
    status = 'OK' if result == expected else 'FAIL'
    if result != expected:
        all_pass = False
    print(f'  classify({code!r}, {cnt}) = {result!r}  [expected {expected!r}]  {status}')

print()
print('All tests passed!' if all_pass else 'SOME TESTS FAILED!')
