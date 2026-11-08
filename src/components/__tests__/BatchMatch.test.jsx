// @vitest-environment jsdom
/**
 * BatchMatch: CSV取込（ResultsPanelから統合した取込側、第1ピース）
 *
 * - CSVをRFC4180準拠でパースし、構造化データをBatchMatchContextに保持
 * - 1列CSV: 唯一の列を自動的にキー列として選択し、店名リストをtextareaに導出
 * - 多列CSV: キー列のチェックボックス一覧を表示。選択順で最初の空でない値を
 *   各行の店名として採用し、textarea（inputText）に反映する
 * - 取込・クリア・列選択で、それ以前の照合結果（stale）は破棄される
 * - 導出された店名リストは既存の「照合」フロー（batchMatch）にそのまま接続する
 *
 * MapLibre GLはjsdomで動かない（WebGL必須）ためBatchMatchMapをモックする。
 */
import React, { useReducer, useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppContext } from '../../context/AppContext'
import { appReducer, createInitialState } from '../../state/appReducer'
import { BatchMatchProvider } from '../../context/BatchMatchContext.jsx'
import BatchMatch from '../BatchMatch'
import { downloadFile } from '../../utils/export'

vi.mock('../BatchMatchMap', () => ({
  default: () => <div data-testid="mini-map" />
}))

vi.mock('../../utils/export', () => ({ downloadFile: vi.fn() }))

const OSM_RESULTS = [
  { type: 'node', id: 101, lat: 34.7, lon: 135.5, tags: { name: '田中ラーメン', amenity: 'restaurant' } },
  { type: 'way', id: 202, lat: 34.71, lon: 135.51, tags: { name: '山本カフェ', shop: 'cafe' } },
  { type: 'node', id: 303, lat: 34.72, lon: 135.52, tags: { name: '鈴木薬局', amenity: 'pharmacy' } }
]

const MULTI_COL_CSV = 'name,phone,addr\n田中ラーメン,06-1111-1111,大阪市\n山本カフェ,06-2222-2222,神戸市\n鈴木薬局,06-3333-3333,堺市'

function Harness({ preActions = [], children }) {
  const [state, dispatch] = useReducer(appReducer, createInitialState())
  useEffect(() => {
    preActions.forEach((a) => dispatch(a))
  }, [])
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <BatchMatchProvider>{children}</BatchMatchProvider>
    </AppContext.Provider>
  )
}

// PC版のタブ切替はアンマウント方式（{mainTab === 'batch' && <BatchMatch />}）。
// プロバイダはアンマウントされず、コンポーネントだけが取り外される状況を再現する。
function UnmountHarness({ visible, preActions = [], children }) {
  const [state, dispatch] = useReducer(appReducer, createInitialState())
  useEffect(() => {
    preActions.forEach((a) => dispatch(a))
  }, [])
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <BatchMatchProvider>
        {visible ? children : null}
      </BatchMatchProvider>
    </AppContext.Provider>
  )
}

function uploadCsv(csvText, fileName = 'test.csv') {
  const file = new File([csvText], fileName, { type: 'text/csv' })
  const input = screen.getByLabelText(/📁 CSV/)
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  cleanup()
  downloadFile.mockClear()
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

describe('BatchMatch: CSV取込（取込側）', () => {
  it('CSV取込ボタンが表示される', () => {
    render(<Harness><BatchMatch /></Harness>)
    expect(screen.getByLabelText(/📁 CSV/)).toBeTruthy()
  })

  it('1列CSV: 店名リストが自動的にtextareaに導出され、ファイル名・件数が表示される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('田中ラーメン\n山本カフェ\n鈴木薬局', 'names.csv')

    await waitFor(() => {
      expect(screen.getByText(/names\.csv（3件）/)).toBeTruthy()
    })
    expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ\n鈴木薬局')
    // 1列CSVでは列選択UIは出ない
    expect(screen.queryByText('照合に使う列を選択してください（複数可）')).toBeNull()
  })

  it('多列CSV: キー列選択UIが表示され、未選択ではtextareaが空で照合が無効', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV, 'shops.csv')

    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    expect(screen.getByText('name')).toBeTruthy()
    expect(screen.getByText('phone')).toBeTruthy()
    expect(screen.getByText('addr')).toBeTruthy()
    expect(screen.getByRole('textbox').value).toBe('')
    expect(screen.getByRole('button', { name: '照合' }).disabled).toBe(true)
  })

  it('キー列を選択すると、その列の値が店名リストとしてtextareaに導出される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })

    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ\n鈴木薬局')
    })
    expect(screen.getByRole('button', { name: '照合' }).disabled).toBe(false)
  })

  it('複数列選択: 各行は選択順で最初の空でない値を採用する', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('name,addr\n田中ラーメン,大阪市\n,神戸市\n山本カフェ,神戸市')
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })

    // addr を先に選択 → 全行 addr の値
    fireEvent.click(screen.getByLabelText('addr'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('大阪市\n神戸市\n神戸市')
    })

    // name も選択 → 選択順（addr優先）で addr の値が残る
    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('大阪市\n神戸市\n神戸市')
    })

    // addr を解除 → name の値に切り替わる
    fireEvent.click(screen.getByLabelText('addr'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ')
    })
  })

  it('全列解除するとtextareaが空になり照合が無効になる', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ\n鈴木薬局')
    })

    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('')
    })
    expect(screen.getByRole('button', { name: '照合' }).disabled).toBe(true)
  })

  it('✕ クリアでCSV状態・textareaがリセットされる', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'CSV入力をクリア' }))
    await waitFor(() => {
      expect(screen.queryByText(/shops\.csv|test\.csv/)).toBeNull()
    })
    expect(screen.queryByText('照合に使う列を選択してください（複数可）')).toBeNull()
    expect(screen.getByRole('textbox').value).toBe('')
  })

  it('引用符内で改行を含むフィールドは1つの行として扱われる（件数が正しく数えられる）', async () => {
    const csv = 'name,addr\n"田中\nラーメン",大阪市\n山本カフェ,神戸市'
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(csv)
    await waitFor(() => {
      expect(screen.getByText(/test\.csv（2件）/)).toBeTruthy()
    })
  })

  it('CRLF改行でも1つの行区切りとして扱われる（幻の空行が増えない）', async () => {
    const csv = 'name,addr\r\n田中ラーメン,大阪市\r\n山本カフェ,神戸市'
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(csv)
    await waitFor(() => {
      expect(screen.getByText(/test\.csv（2件）/)).toBeTruthy()
    })
  })

  it('データのないファイルはアラートを表示し状態は変更されない', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('')
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('ファイルからデータを読み込めませんでした。')
    })
    expect(screen.queryByText(/test\.csv/)).toBeNull()
  })
})

describe('BatchMatch: CSV取込→照合（既存フローへの接続）', () => {
  it('CSV取込→列選択→照合: 選択列の値が店名としてbatchMatchに渡される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })

    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ\n鈴木薬局')
    })

    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/3件中/)).toBeTruthy()
    })
    // 左ペインの対象施設リストに3件が並ぶ（入力名と照合施設名が同一テキストのため複数マッチする）
    expect(screen.getAllByText('田中ラーメン').length).toBeGreaterThan(0)
    expect(screen.getAllByText('山本カフェ').length).toBeGreaterThan(0)
    expect(screen.getAllByText('鈴木薬局').length).toBeGreaterThan(0)
    // 照合直後は未確定（確定は候補選択→「確定」クリックで付く）なので3件とも要確認
    expect(screen.getByText(/要確認 3/)).toBeTruthy()
  })

it('新しいCSVを取込ると、以前の照合結果はstaleとして破棄される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)

    // 貼り付けで照合を実行（結果がある状態を作る）
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '田中ラーメン' } })
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/1件中/)).toBeTruthy()
    })

    // 新しいCSVを取込むと結果表示が消える
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.queryByText(/1件中/)).toBeNull()
    })
    expect(screen.getByText(/shops\.csv|test\.csv/)).toBeTruthy()
  })
})

describe('BatchMatch: CSV取込（エッジケース）', () => {
  it('ヘッダーのみ（データ行なし）のファイルはアラートを表示し状態は変更されない', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('name,addr\n')
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('ファイルからデータを読み込めませんでした。')
    })
    expect(screen.queryByText(/test\.csv/)).toBeNull()
    expect(screen.queryByText('照合に使う列を選択してください（複数可）')).toBeNull()
  })

  it('タブ区切り（TSV）の多列CSVもパースされ、列選択で店名が導出される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('name\tphone\n田中ラーメン\t06-1111-1111\n山本カフェ\t06-2222-2222', 'tsv.tsv')

    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    expect(screen.getByText('name')).toBeTruthy()
    expect(screen.getByText('phone')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ')
    })
  })

  it('カンマなしの名前リスト.txtファイルも同一のCSV取込ボタンで読み込める（1列扱い）', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('田中ラーメン\n山本カフェ', 'names.txt')

    await waitFor(() => {
      expect(screen.getByText(/names\.txt（2件）/)).toBeTruthy()
    })
    expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ')
    // 1列ファイルなので列選択UIは出ない
    expect(screen.queryByText('照合に使う列を選択してください（複数可）')).toBeNull()
  })

  it('キー列がすべて空の行は件数には含まれるが、店名リストからはスキップされる', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('name,addr\n田中ラーメン,大阪市\n,,\n山本カフェ,神戸市')

    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      // 3行中、nameが空の行はスキップされて2件の店名が導出される
      expect(screen.getByText(/test\.csv（3件）/)).toBeTruthy()
      expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ')
    })
  })

  it('PCタブ切替（コンポーネントのアンマウント/リマウント）でCSV状態が保持される', async () => {
    // プロバイダはアンマウントされず、BatchMatchコンポーネントだけが取り外される
    let utils = render(
      <UnmountHarness visible={true} preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }>
        <BatchMatch />
      </UnmountHarness>
    )
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ\n鈴木薬局')
    })

    // 別のタブへ切替（BatchMatchがアンマウント）
    utils.rerender(
      <UnmountHarness visible={false} preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }>
        <BatchMatch />
      </UnmountHarness>
    )
    // 一括照合タブへ戻す（BatchMatchが再マウント）
    utils.rerender(
      <UnmountHarness visible={true} preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }>
        <BatchMatch />
      </UnmountHarness>
    )

    // contextに保持された状態が復元される
    expect(screen.getByText(/test\.csv（3件）/)).toBeTruthy()
    expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ\n鈴木薬局')
    expect(screen.getByLabelText('name').checked).toBe(true)
  })

  it('店名が空のCSV行は施設リスト・サマリーに表示されない（行揃え照合）', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('name,addr\n田中ラーメン,大阪市\n,,\n鈴木薬局,堺市')

    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText('2件中:')).toBeTruthy()
    })
    // 名前のない行は施設リストに表示されない（matchType 'empty' を除外）
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('田中ラーメン')
    expect(items[1].textContent).toContain('鈴木薬局')
    // サマリーも名前のある行のみ集計（空行が「候補なし」に計上されない）
    expect(screen.getByText('候補なし 0')).toBeTruthy()
  })
})

describe('BatchMatch: 地図用CSVダウンロード（取込CSVフロー）', () => {
  it('CSV取込→照合→確定: 元のCSVの列・順序を保ち、lat/lon/osmidを追加する', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })

    // 「田中ラーメン」の行を選択して候補を確定
    // 行ラベルはspan（matched名はpタグ）なのでspanに絞る
    fireEvent.click(screen.getByText('田中ラーメン', { selector: 'span' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確定' })[0])

    // 地図用CSVをダウンロード
    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))
    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(l).toEqual([
      'name,phone,addr,lat,lon,osmid',
      '田中ラーメン,06-1111-1111,大阪市,34.700000,135.500000,node/101',
      '山本カフェ,06-2222-2222,神戸市,,,' ,
      '鈴木薬局,06-3333-3333,堺市,,,'
    ])
    expect(filename).toMatch(/^map-locations-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('導出でスキップされた行でも、確定結果は正しい元の行に入る', async () => {
    // 2行目のキー列が全空 → 導出ではスキップされるが、出力にはそのまま残る
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('name,addr\n田中ラーメン,大阪市\n,,\n鈴木薬局,堺市')
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })

    // 「鈴木薬局」（元のCSVの3行目・導出位置2）を確定
    fireEvent.click(screen.getByText('鈴木薬局', { selector: 'span' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確定' })[0])
    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))

    const [csv] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(l).toEqual([
      'name,addr,lat,lon,osmid',
      '田中ラーメン,大阪市,,,' ,
      ',,,,' ,
      '鈴木薬局,堺市,34.720000,135.520000,node/303'
    ])
  })

  it('textareaの内容がCSV導出リストと一致しない場合、従来の9列形式にフォールバックする', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    // 導出リストを上書きして別の店名を貼り付ける（行の対応が保証されない）
    // 「青墨寿司」はOSM名と編集距離2以内にならず、候補なしになる
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '青墨寿司' } })
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/候補なし \d+/)).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))

    const [csv] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(l[0]).toBe('name,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source')
    expect(l[1]).toContain('青墨寿司')
    expect(l[1]).toContain('候補なし')
    expect(l[1].split(',')).toHaveLength(9)
  })

  it('CSV取込なしの貼り付け入力: 従来の9列形式を使う（既存挙動は不変）', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '田中ラーメン' } })
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))

    const [csv] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(l[0]).toBe('name,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source')
    expect(l[1]).toContain('田中ラーメン')
    expect(l[1]).toContain('要確認')
    expect(l[1].split(',')).toHaveLength(9)
  })

  it('元のCSVにlat/lon列が既にある場合、その列へ上書きしosmidのみ末尾追加する', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('name,addr,lat,lon\n田中ラーメン,大阪市,,\n山本カフェ,神戸市,,\n鈴木薬局,堺市,,')
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })

    // 「田中ラーメン」の行を選択して候補を確定
    fireEvent.click(screen.getByText('田中ラーメン', { selector: 'span' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確定' })[0])
    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))

    const [csv] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(l).toEqual([
      'name,addr,lat,lon,osmid',
      '田中ラーメン,大阪市,34.700000,135.500000,node/101',
      '山本カフェ,神戸市,,,' ,
      '鈴木薬局,堺市,,,'
    ])
  })

  it('照合後にtextareaを編集してCSV導出リストと乖離すると、従来の9列形式にフォールバックする', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })

    // 「田中ラーメン」の候補を確定
    fireEvent.click(screen.getByText('田中ラーメン', { selector: 'span' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確定' })[0])

    // textareaを編集: 先頭行を削除してCSV導出リストと一致させない
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '山本カフェ\n鈴木薬局' }
    })

    // ダウンロード: 行の対応が保証できない → 従来の固定9列形式
    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))
    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [csv] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(l).toEqual([
      'name,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source',
      '田中ラーメン,34.700000,135.500000,確認済み,,node,node/101,https://www.openstreetmap.org/node/101,© OpenStreetMap contributors (ODbL)',
      '山本カフェ,,,要確認,,,,,' ,
      '鈴木薬局,,,要確認,,,,,'
    ])
  })

  it('textareaの末尾に改行があってもCSV導出と一致すると判定され、元のCSV形式で出力される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })
    fireEvent.click(screen.getByText('田中ラーメン', { selector: 'span' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確定' })[0])

    // 末尾に改行を追加（parseNameList は空行を捨てるため依然一致）
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '田中ラーメン\n山本カフェ\n鈴木薬局\n' }
    })

    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))
    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [csv] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    // 元のCSVの列＋lat/lon/osmid の形式が維持される
    expect(l).toEqual([
      'name,phone,addr,lat,lon,osmid',
      '田中ラーメン,06-1111-1111,大阪市,34.700000,135.500000,node/101',
      '山本カフェ,06-2222-2222,神戸市,,,' ,
      '鈴木薬局,06-3333-3333,堺市,,,'
    ])
  })

  it('1列CSV（ヘッダーなし）: 元の列を保持したままlat/lon/osmidを末尾追加する', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)
    uploadCsv('田中ラーメン\n山本カフェ\n鈴木薬局', 'names.csv')

    await waitFor(() => {
      expect(screen.getByText(/names\.csv（3件）/)).toBeTruthy()
    })
    // 1列ファイル: キー列は自動選択され、列選択UIは出ない
    expect(screen.queryByText('照合に使う列を選択してください（複数可）')).toBeNull()
    expect(screen.getByRole('textbox').value).toBe('田中ラーメン\n山本カフェ\n鈴木薬局')

    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })
    fireEvent.click(screen.getByText('田中ラーメン', { selector: 'span' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確定' })[0])

    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))
    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [csv] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(l).toEqual([
      'col_1,lat,lon,osmid',
      '田中ラーメン,34.700000,135.500000,node/101',
      '山本カフェ,,,' ,
      '鈴木薬局,,,'
    ])
  })
})

describe('BatchMatch: 地図用CSVダウンロード（貼り付けフロー）', () => {
  it('元のCSVが無い場合（名前リストを貼り付け）は、既存の9列形式のまま変えない', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] }><BatchMatch /></Harness>)

    // CSV取込らずに名前リストを直接貼り付ける
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '田中ラーメン\n山本カフェ\n鈴木薬局' }
    })
    fireEvent.click(screen.getByRole('button', { name: '照合' }))
    await waitFor(() => {
      expect(screen.getByText(/要確認 \d+/)).toBeTruthy()
    })

    // 「田中ラーメン」の候補を確定
    fireEvent.click(screen.getByText('田中ラーメン', { selector: 'span' }))
    fireEvent.click(screen.getAllByRole('button', { name: '確定' })[0])

    // 地図用CSVをダウンロード
    fireEvent.click(screen.getByRole('button', { name: /地図用CSV/ }))
    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadFile.mock.calls[0]
    const l = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    // 従来の固定9列形式（元のCSVの列・lat/lon/osmid追加ではない）
    expect(l).toEqual([
      'name,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source',
      '田中ラーメン,34.700000,135.500000,確認済み,,node,node/101,https://www.openstreetmap.org/node/101,© OpenStreetMap contributors (ODbL)',
      '山本カフェ,,,要確認,,,,,' ,
      '鈴木薬局,,,要確認,,,,,'
    ])
    expect(filename).toMatch(/^map-locations-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
