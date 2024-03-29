import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useGetLoginInfo } from "@multiversx/sdk-dapp/hooks";
import { API_URL } from "../../utils/constants";
 import DataAssetCard from "../CardComponents/DataAssetCard";
import toast, { Toaster } from "react-hot-toast";
import { Lightbulb, Loader, Loader2 } from "lucide-react";
import { set } from "react-hook-form";

interface DataStream {
  name: string;
  creator: string;
  created_on: string;
  last_modified_on: string;
  marshalManifest: {
    totalItems: number;
    nestedStream: boolean;
  };
}
interface ManifestFile {
  data_stream: DataStream;
  data: [];
  version: number;
  manifestFileName: string;
  folderCid: string;
  cidv1: string;
}

type DataAsset = {
  fileName: string;
  id: string;
  folderCid: string;
  cid: string;
  cidv1: string;
  mimeType: string;
};
/// todo check why some of the manifest files are not downloaded and show the bad manifest
export const DataAssetList: React.FC = () => {
  const [storedDataAssets, setStoredDataAssets] = useState<DataAsset[]>([]);
  const { tokenLogin } = useGetLoginInfo();
  const theToken = tokenLogin?.nativeAuthToken;

  // const [latestVersionCid, setLatestVersionCid] = useState<{ [key: string]: { version: number; cidv1: string } }>({});
  const [manifestFiles, setManifestFiles] = useState<ManifestFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // fetch all data assets of an address
  async function fetchAllDataAssetsOfAnAddress() {
    const apiUrlGet = `${API_URL}/files?manifest=true`;
    setIsLoading(true);
    try {
      const response = await axios.get(apiUrlGet, {
        headers: {
          "authorization": `Bearer ${theToken}`,
        },
      });
      console.log("response.data");

      response.data.map((item: any) => {
        console.log(item);
      });

      setStoredDataAssets(response.data);
    } catch (error: any) {
      console.error("Eror fetching data assets", error);
      if (error?.response.data.statusCode === 403) {
        toast("Native auth token expired. Re-login and try again! ", {
          icon: <Lightbulb color="yellow"></Lightbulb>,
        });
      } else {
        toast("Sorry, there’s a problem with the service, try again later " + `${error ? error.message + ". " + error?.response?.data.message : ""}`, {
          icon: <Lightbulb color="yellow"></Lightbulb>,
        });
      }
      throw error; // error to be catched by toast.promise
    }
  }

  // // get the latest version of the manifest file for each data asset
  // function getManifestFilesFromDataAssets() {
  //   if (storedDataAssets) {
  //     const filteredData = storedDataAssets.filter((item) => item.fileName && item.fileName.includes("manifest"));

  //     let latestVersionManifestFile: { [key: string]: { version: number; cidv1: string } } = {};
  //     filteredData.forEach((item) => {
  //       const fileName = item.fileName.split(".-")[1]; //.split("|")[0]; //   filename format is "1.-manifest-name-creator|random-.json"

  //       const version = parseInt(item.fileName.split(".-")[0]);
  //       if (!fileName) return;

  //       if (!latestVersionManifestFile[fileName] || version > latestVersionManifestFile[fileName].version) {
  //         latestVersionManifestFile[fileName] = {
  //           version: version,
  //           cidv1: item.cidv1,
  //         };
  //       }
  //     });
  //     setLatestVersionCid(latestVersionManifestFile);
  //   }
  // }

  // download the manifest file for the coresponding CID
  async function downloadTheManifestFile(folderCid: string, manifestFileName: string, manifestCid: string) {
    const apiUrlDownloadFile = `${API_URL}/file/` + manifestCid;

    try {
      const response = await axios.get(apiUrlDownloadFile, {
        headers: {
          "authorization": `Bearer ${theToken}`,
        },
      });
      if (!response.data?.data_stream) {
        /// empty manifest file or wrong format
        return undefined;
      }
      const versionStampedManifestFile = { ...response.data, manifestFileName: manifestFileName, cidv1: manifestCid, folderCid: folderCid };
      setManifestFiles((prev) => [...prev, versionStampedManifestFile]);
    } catch (error) {
      console.log("Error downloading manifest files:", error);
      //toast.error("Error downloading manifest files. Check your connection and try again. " + (error as Error).message, { id: "fetch-manifest-file" });
      toast("Wait some more time for the manifest file to get pinned if you can't find the one you are looking for", {
        icon: <Lightbulb color="yellow"></Lightbulb>,
        id: "fetch-manifest-file1",
      });
    }
  }

  useEffect(() => {
    if (storedDataAssets.length === 0) {
      toast.promise(fetchAllDataAssetsOfAnAddress(), {
        loading: "Fetching all data assets from Ipfs of your address...",
        success: <b>Fetched all data assets from Ipfs of your address!</b>,
        error: <b>The data assests could not be fetched. </b>,
      });
    }
  }, []);

  // useEffect(() => {
  //   getManifestFilesFromDataAssets();
  // }, [storedDataAssets]);

  useEffect(() => {
    const downloadLatestVersionsManifestFiles = async () => {
      if (storedDataAssets.length !== 0) {
        await Promise.all(
          storedDataAssets.map(async (manifestAsset: any) => {
            await downloadTheManifestFile(manifestAsset.folderCid, manifestAsset.fileName, manifestAsset.cidv1);
          })
        );
        setIsLoading(false);
      }
    };
    downloadLatestVersionsManifestFiles();
  }, [storedDataAssets]);

  return (
    <div className="p-4 flex flex-col">
      {isLoading && (
        <div className=" flex justify-center items-center -mt-4">
          <Loader2 color="cyan" className="animate-spin rounded-full"></Loader2>
        </div>
      )}
      <div className="gap-4 grid grid-cols-3">
        {manifestFiles.map((manifest: ManifestFile, index) => (
          <Link
            key={index}
            to={"/upload"}
            state={{
              manifestFile: manifestFiles[index],
              action: "Update Data Asset",
              currentManifestFileCID: manifestFiles[index].cidv1,
              manifestFileName: manifestFiles[index].manifestFileName,
              folderCid: manifestFiles[index].folderCid,
            }}>
            <DataAssetCard dataAsset={manifest.data_stream}></DataAssetCard>
          </Link>
        ))}
      </div>
    </div>
  );
};
